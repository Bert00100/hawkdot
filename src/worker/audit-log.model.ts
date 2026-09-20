import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { WorkerTenantClient } from "@/worker/with-worker-tenant";

export type CreateWorkerAuditLogData = {
    organizationId: string;
    action: string;
    entityType: string;
    entityId?: string;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
};

// actor_user_id sempre NULL aqui -- audit_logs_worker_insert (#43) exige
// exatamente isso, porque o worker nao age em nome de ninguem (mesmo
// raciocinio do withWorkerTenant so definir current_organization_id, nunca
// current_user_id). hawkdot_worker so tem GRANT INSERT em audit_logs (nao
// SELECT) -- `.create()` do Prisma (que sempre faz INSERT...RETURNING)
// falharia de qualquer forma por falta de policy de SELECT para esse role;
// $executeRaw sem RETURNING evita o problema, mesma tecnica do lado da API
// em src/models/audit-log.model.ts.
export async function createWorkerAuditLog(
    tx: WorkerTenantClient,
    data: CreateWorkerAuditLogData,
): Promise<void> {
    const id = randomUUID();

    await tx.$executeRaw`
        INSERT INTO hawkdot.audit_logs (
            id, organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
        ) VALUES (
            ${id}::uuid, ${data.organizationId}::uuid, NULL, ${data.action}, ${data.entityType},
            ${data.entityId ?? null}::uuid,
            ${data.beforeData ? Prisma.sql`${JSON.stringify(data.beforeData)}::jsonb` : Prisma.sql`NULL`},
            ${data.afterData ? Prisma.sql`${JSON.stringify(data.afterData)}::jsonb` : Prisma.sql`NULL`}
        )
    `;
}
