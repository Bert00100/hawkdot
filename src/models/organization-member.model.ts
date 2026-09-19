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

export type OrganizationMemberListItem = {
    user_id: string;
    email: string;
    display_name: string;
    role: "owner" | "admin" | "operator" | "viewer";
    status: "active" | "invited" | "suspended";
    joined_at: Date | null;
    invited_by: string | null;
    created_at: Date;
};

// Roda DENTRO de withTenant() (organization_id ja no contexto). Mesmo
// motivo da #17: users_self_select so mostra o proprio usuario, entao um
// JOIN comum dentro do tx nao traria nome/e-mail dos outros membros. A
// funcao SECURITY DEFINER usa current_organization_id() por dentro e
// reconfirma is_organization_member() -- nao aceita organization_id vindo
// do cliente.
export async function listOrganizationMembers(
    tx: TenantClient,
    pagination: { limit: number; offset: number },
): Promise<OrganizationMemberListItem[]> {
    return tx.$queryRaw<OrganizationMemberListItem[]>`
        SELECT * FROM hawkdot_private.list_organization_members(${pagination.limit}, ${pagination.offset})
    `;
}

export async function countOrganizationMembers(tx: TenantClient): Promise<number> {
    const rows = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT hawkdot_private.count_organization_members() AS count
    `;

    return Number(rows[0]?.count ?? 0);
}

export type MemberRole = "owner" | "admin" | "operator" | "viewer";

// So roda dentro de withTenant() com o convidante ja como membro
// owner/admin (verificado por requireRole antes de chamar). RETURNING
// funciona normalmente aqui -- diferente do bootstrap do signup, o
// convidante ja e membro ativo da organizacao, entao
// is_organization_member(organization_id) ja e verdadeiro para qualquer
// linha dessa org, inclusive a que esta sendo inserida.
export function createInvite(
    tx: TenantClient,
    params: { organizationId: string; userId: string; role: MemberRole; invitedBy: string },
) {
    return tx.organization_members.create({
        data: {
            organization_id: params.organizationId,
            user_id: params.userId,
            role: params.role,
            status: "invited",
            invited_by: params.invitedBy,
        },
    });
}

export type AcceptedInvite = {
    organization_id: string;
    role: MemberRole;
    status: "active";
    joined_at: Date;
};

// So roda dentro de withTenant() com o CONVIDADO como current_user_id (nao
// precisa ser membro ativo da organizacao ainda -- e o proprio ponto). Usa
// a funcao SECURITY DEFINER hawkdot_private.accept_own_invite, que ignora
// RLS por completo para esta operacao -- ver o comentario extenso no
// schema.sql sobre por que uma policy adicional nao funciona aqui (Postgres
// exige a linha visivel por uma policy de SELECT tambem para UPDATE, nao so
// a policy de UPDATE em si).
export async function acceptOwnInvite(
    tx: TenantClient,
    organizationId: string,
): Promise<AcceptedInvite | null> {
    const rows = await tx.$queryRaw<AcceptedInvite[]>`
        SELECT * FROM hawkdot_private.accept_own_invite(${organizationId}::uuid)
    `;

    return rows[0] ?? null;
}
