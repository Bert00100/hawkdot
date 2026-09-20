import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { createAuditLog } from "@/models/audit-log.model";

// So dados simples (nunca o objeto Request) -- mantem o controller livre de
// HTTP, conforme a convencao de camadas do AGENTS.md. A rota extrai isso da
// request e passa adiante.
export type RequestMeta = { ipAddress?: string; userAgent?: string };

// x-forwarded-for pode trazer uma lista "cliente, proxy1, proxy2" -- o
// primeiro IP e o do cliente original. Sem proxy configurado (dev local),
// nenhum dos dois headers existe e o campo fica ausente -- ip_address e
// nullable no banco de proposito.
export function extractRequestMeta(request: Request): RequestMeta {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    return { ipAddress, userAgent };
}

export type AuditParams = {
    action: string;
    entityType: string;
    entityId?: string;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
};

// actor_user_id sempre o usuario da sessao -- a API nunca grava nulo (so o
// worker pode, ver audit_logs_worker_insert/audit_logs_member_insert no
// schema.sql). before/after devem ja vir sem nenhum campo de segredo: essa
// funcao nao faz filtragem nenhuma, quem monta o payload e responsavel por
// nunca incluir secret/encrypted_secret/password_hash etc.
export function recordAudit(
    tx: TenantClient,
    session: Session,
    meta: RequestMeta,
    params: AuditParams,
) {
    return createAuditLog(tx, {
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        beforeData: params.beforeData,
        afterData: params.afterData,
    });
}
