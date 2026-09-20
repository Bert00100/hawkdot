import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import type { Paginacao } from "@/lib/dto/common";
import {
    acceptOwnInvite,
    countOrganizationMembers,
    createInvite,
    listOrganizationMembers,
} from "@/models/organization-member.model";
import { withTenant } from "@/lib/tenant/with-tenant";
import { findUserIdByEmail } from "@/models/user.model";
import { requireRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import { recordAudit, type RequestMeta } from "@/lib/audit/record-audit";
import type { InviteMemberInput } from "@/lib/dto/organization.dto";

export type MemberListResult = {
    items: {
        user_id: string;
        email: string;
        display_name: string;
        role: string;
        status: string;
        joined_at: Date | null;
    }[];
    page: number;
    per_page: number;
    total: number;
};

// Leitura livre para qualquer membro ativo (members_select nao restringe
// por papel) -- nao precisa de requireRole.
export async function listMembers(
    tx: TenantClient,
    _session: Session,
    { page, per_page }: Paginacao,
): Promise<MemberListResult> {
    const offset = (page - 1) * per_page;

    const [members, total] = await Promise.all([
        listOrganizationMembers(tx, { limit: per_page, offset }),
        countOrganizationMembers(tx),
    ]);

    return {
        items: members.map((m) => ({
            user_id: m.user_id,
            email: m.email,
            display_name: m.display_name,
            role: m.role,
            status: m.status,
            joined_at: m.joined_at,
        })),
        page,
        per_page,
        total,
    };
}

export type InviteMemberResult = {
    user_id: string;
    role: string;
    status: string;
};

// Decisao documentada (issue #23): o schema nao tem tabela de convites por
// e-mail nem coluna nullable para isso em organization_members (user_id e
// NOT NULL, referencia users). Criar essa estrutura seria uma mudanca de
// banco maior, fora do escopo do MVP. Por isso o convite so funciona para
// e-mail que ja tem conta -- se nao tiver, a resposta e 404 com mensagem
// clara pedindo que a pessoa crie conta primeiro (nao 500, nao um "convite
// fantasma" que nunca vira nada).
export async function inviteMember(
    tx: TenantClient,
    session: Session,
    input: InviteMemberInput,
    meta: RequestMeta = {},
): Promise<InviteMemberResult> {
    await requireRole(tx, session, ["owner", "admin"]);

    const userId = await findUserIdByEmail(input.email);
    if (!userId) {
        throw notFound(
            "Nao encontramos uma conta com esse e-mail. A pessoa precisa criar uma conta antes de ser convidada.",
        );
    }

    const membership = await createInvite(tx, {
        organizationId: session.organizationId,
        userId,
        role: input.role,
        invitedBy: session.userId,
    });

    await recordAudit(tx, session, meta, {
        action: "member.invited",
        entityType: "organization_member",
        entityId: userId,
        afterData: { role: membership.role, status: membership.status },
    });

    return { user_id: membership.user_id, role: membership.role, status: membership.status };
}

export type AcceptInviteResult = {
    organization_id: string;
    role: string;
    status: string;
};

// Nao usa withSession: o convite pode ser para uma organizacao DIFERENTE da
// organizacao ativa atual do usuario (o JWT pode nem ter sido emitido para
// essa organizacao ainda -- e justamente o caso comum de um convite novo).
// getSession() so confirma quem e o usuario; withTenant() abre o contexto
// para a organizacao ALVO do convite, nao a da sessao.
export async function acceptInvite(userId: string, organizationId: string): Promise<AcceptInviteResult> {
    const membership = await withTenant({ userId, organizationId }, (tx) =>
        acceptOwnInvite(tx, organizationId),
    );

    if (!membership) {
        throw notFound("Convite");
    }

    return {
        organization_id: membership.organization_id,
        role: membership.role,
        status: membership.status,
    };
}
