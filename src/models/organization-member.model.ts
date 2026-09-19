import type { TenantClient } from "@/lib/tenant/with-tenant";
import prisma from "@/config/database";

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

export type ActiveMembership = {
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    role: "owner" | "admin" | "operator" | "viewer";
    joined_at: Date;
};

// Roda ANTES de existir contexto de tenant -- no login (#15) e exatamente o
// organization_id que ainda nao se sabe (e o que esta funcao descobre); o
// /me (#17) reusa para listar todas as organizacoes do usuario. members_select
// exige organization_id = current_organization_id(), entao uma consulta
// normal nao serve aqui -- usa a funcao SECURITY DEFINER
// hawkdot_private.find_active_organization_memberships via $queryRaw no
// client guardado (raw query, nao operacao de modelo -- guard do #10 nao
// intercepta).
export async function findActiveOrganizationMemberships(
    userId: string,
): Promise<ActiveMembership[]> {
    return prisma.$queryRaw<ActiveMembership[]>`
        SELECT * FROM hawkdot_private.find_active_organization_memberships(${userId}::uuid)
    `;
}
