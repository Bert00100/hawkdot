import type { TenantClient } from "@/lib/tenant/with-tenant";

// So roda dentro de withTenant(), logo apos criar a organizacao na mesma
// transacao (signup, #14). members_insert aceita este insert pela segunda
// clausula do OR: user_id = current_user_id(), role = 'owner',
// status = 'active' e organization_has_members(organization_id) ainda falso
// (e o primeiro membro). O CHECK active_member_has_joined_at exige
// joined_at preenchido para status 'active'.
//
// Mesmo motivo do organizations: INSERT sem RETURNING. members_select
// tambem depende de is_organization_member(organization_id), que so fica
// verdadeiro depois que ESTA linha existir -- o `.create()` do Prisma faz
// RETURNING e falharia pelo mesmo 42501 avaliando a propria linha que esta
// sendo inserida.
export async function createOwnerMembership(
    tx: TenantClient,
    params: { organizationId: string; userId: string },
): Promise<void> {
    await tx.$executeRaw`
        INSERT INTO hawkdot.organization_members
            (organization_id, user_id, role, status, joined_at)
        VALUES (${params.organizationId}::uuid, ${params.userId}::uuid, 'owner', 'active', now())
    `;
}
