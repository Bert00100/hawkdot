import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { TenantClient } from "@/lib/tenant/with-tenant";

export type CreateAuditLogData = {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
};

// audit_before_object / audit_after_object exigem objeto JSON quando
// preenchidos -- nunca array/primitivo solto. actor_user_id nulo so e
// aceito pela policy audit_logs_worker_insert; a API sempre grava o
// usuario autenticado (audit_logs_member_insert exige
// actor_user_id = current_user_id()).
//
// $executeRaw sem RETURNING de proposito (mesmo padrao do bootstrap de
// signup, #14): audit_logs_admin_select restringe leitura a owner/admin, e
// `.create()` do Prisma sempre faz INSERT...RETURNING -- para quem grava a
// auditoria (qualquer membro, via audit_logs_member_insert) mas nao e
// owner/admin, o RETURNING falharia com 42501 mesmo o INSERT em si sendo
// permitido pelo WITH CHECK.
export async function createAuditLog(tx: TenantClient, data: CreateAuditLogData): Promise<{ id: string }> {
    const id = randomUUID();

    await tx.$executeRaw`
        INSERT INTO hawkdot.audit_logs (
            id, organization_id, actor_user_id, action, entity_type, entity_id,
            ip_address, user_agent, before_data, after_data
        ) VALUES (
            ${id}::uuid, ${data.organizationId}::uuid, ${data.actorUserId}::uuid, ${data.action}, ${data.entityType},
            ${data.entityId ?? null}::uuid, ${data.ipAddress ?? null}::inet, ${data.userAgent ?? null},
            ${data.beforeData ? Prisma.sql`${JSON.stringify(data.beforeData)}::jsonb` : Prisma.sql`NULL`},
            ${data.afterData ? Prisma.sql`${JSON.stringify(data.afterData)}::jsonb` : Prisma.sql`NULL`}
        )
    `;

    return { id };
}

export type ListAuditLogsFilters = { page: number; perPage: number };

export function listAuditLogs(tx: TenantClient, filters: ListAuditLogsFilters) {
    return tx.audit_logs.findMany({
        orderBy: { created_at: "desc" },
        skip: (filters.page - 1) * filters.perPage,
        take: filters.perPage,
    });
}

export function countAuditLogs(tx: TenantClient) {
    return tx.audit_logs.count();
}
