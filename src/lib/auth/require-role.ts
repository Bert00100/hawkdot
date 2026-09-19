import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { forbidden } from "@/lib/errors";

export type MemberRole = "owner" | "admin" | "operator" | "viewer";

// Espelha as policies de RLS (tenant_app_insert/update/delete exigem
// owner/admin/operator; credentials e audit_logs de leitura exigem so
// owner/admin) -- os papeis passados aqui precisam bater exatamente com a
// policy correspondente no .sql, ou o resultado e um bug confuso (app
// permite, banco recusa, ou vice-versa).
//
// Nao e redundante com o RLS: sem esta checagem, um viewer tentando escrever
// recebe um erro cru de violacao de policy do Postgres em vez de um 403 com
// mensagem clara. O RLS continua sendo a garantia real (ver AGENTS.md,
// "Contrato de acesso a dados") -- isto so melhora a experiencia.
export async function requireRole(
    tx: TenantClient,
    session: Session,
    allowedRoles: MemberRole[],
): Promise<MemberRole> {
    const membership = await tx.organization_members.findUnique({
        where: {
            organization_id_user_id: {
                organization_id: session.organizationId,
                user_id: session.userId,
            },
        },
    });

    if (!membership || membership.status !== "active" || !allowedRoles.includes(membership.role)) {
        throw forbidden("Voce nao tem permissao para esta acao.");
    }

    return membership.role;
}
