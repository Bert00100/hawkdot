import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { findActiveOrganizationMemberships } from "@/models/organization-member.model";

export type MeResult = {
    user: { id: string; email: string; display_name: string };
    organization: { id: string; name: string; slug: string; role: string };
    organizations: { id: string; name: string; slug: string; role: string }[];
};

// tx ja vem com o contexto da organizacao ATIVA (session.organizationId).
// users_self_select (id = current_user_id()) enxerga o proprio usuario
// independente de organizacao. Mas a LISTA de todas as organizacoes do
// usuario precisa da funcao SECURITY DEFINER reaproveitada do login (#15):
// organizations_member_select so enxerga a organizacao ativa, entao uma
// consulta comum dentro do tx nunca veria nome/slug de outra organizacao do
// mesmo usuario -- a funcao ja resolve isso com um JOIN por dentro
// (row_security off).
export async function getMe(tx: TenantClient, session: Session): Promise<MeResult> {
    const [user, memberships] = await Promise.all([
        tx.users.findUniqueOrThrow({ where: { id: session.userId } }),
        findActiveOrganizationMemberships(session.userId),
    ]);

    const organizations = memberships.map((membership) => ({
        id: membership.organization_id,
        name: membership.organization_name,
        slug: membership.organization_slug,
        role: membership.role,
    }));

    const organizacaoAtiva = organizations.find((org) => org.id === session.organizationId);
    if (!organizacaoAtiva) {
        // Nao deveria ser alcancavel: o JWT so e emitido (login, #15; troca
        // de org, #18) com uma organizacao onde o usuario e membro ativo.
        throw new Error("Sessao aponta para uma organizacao da qual o usuario nao e mais membro.");
    }

    return {
        user: { id: user.id, email: user.email, display_name: user.display_name },
        organization: organizacaoAtiva,
        organizations,
    };
}
