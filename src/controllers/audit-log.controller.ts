import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import type { Paginacao } from "@/lib/dto/common";
import { requireRole } from "@/lib/auth/require-role";
import { countAuditLogs, listAuditLogs } from "@/models/audit-log.model";

// audit_logs_admin_select (RLS) ja restringe leitura a owner/admin --
// requireRole complementa com 403 legivel, mesmo raciocinio de sempre.
const READ_ROLES = ["owner", "admin"] as const;

export type AuditLogItem = {
    id: string;
    actor_user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    before_data: unknown;
    after_data: unknown;
    created_at: Date;
};

export type AuditLogListResult = {
    items: AuditLogItem[];
    page: number;
    per_page: number;
    total: number;
};

export async function listAuditLogsController(
    tx: TenantClient,
    session: Session,
    pagination: Paginacao,
): Promise<AuditLogListResult> {
    await requireRole(tx, session, [...READ_ROLES]);

    const [items, total] = await Promise.all([
        listAuditLogs(tx, { page: pagination.page, perPage: pagination.per_page }),
        countAuditLogs(tx),
    ]);

    return { items, page: pagination.page, per_page: pagination.per_page, total };
}
