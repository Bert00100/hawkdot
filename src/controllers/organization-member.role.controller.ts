import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { forbidden, notFound } from "@/lib/errors";
import { recordAudit, type RequestMeta } from "@/lib/audit/record-audit";
import {
    countActiveOwners,
    deleteMember,
    findMembership,
    updateMemberRole,
    type MemberRole,
} from "@/models/organization-member.model";

// Regras de negocio desta issue que NAO estao no banco (members_update e
// members_delete so exigem owner/admin do ATOR, nada mais):
// - admin nao pode alterar nem remover um owner (decisao da issue:
//   "recomendado: nao") -- so outro owner pode.
// - o ultimo owner ativo nao pode ser removido, nem rebaixado do proprio
//   papel -- deixaria a organizacao sem ninguem capaz de administra-la.
async function assertCanActOnOwner(
    tx: TenantClient,
    organizationId: string,
    actorRole: MemberRole,
    targetRole: MemberRole,
) {
    if (targetRole !== "owner") return;

    if (actorRole !== "owner") {
        throw forbidden("Somente outro owner pode alterar ou remover um owner.");
    }

    const owners = await countActiveOwners(tx, organizationId);
    if (owners <= 1) {
        throw forbidden("A organizacao precisa ter pelo menos um owner.");
    }
}

export type ChangeMemberRoleResult = {
    user_id: string;
    role: string;
    status: string;
};

export async function changeMemberRole(
    tx: TenantClient,
    session: Session,
    targetUserId: string,
    newRole: MemberRole,
    meta: RequestMeta = {},
): Promise<ChangeMemberRoleResult> {
    const actorRole = await requireRole(tx, session, ["owner", "admin"]);

    const membership = await findMembership(tx, session.organizationId, targetUserId);
    if (!membership) {
        throw notFound("Membro");
    }

    // Rebaixar o ultimo owner e um caso do mesmo bloqueio geral acima
    // (targetRole = 'owner' antes da troca), independente do newRole pedido.
    await assertCanActOnOwner(tx, session.organizationId, actorRole, membership.role);

    const updated = await updateMemberRole(tx, session.organizationId, targetUserId, newRole);

    await recordAudit(tx, session, meta, {
        action: "member.role_changed",
        entityType: "organization_member",
        entityId: targetUserId,
        beforeData: { role: membership.role },
        afterData: { role: updated.role },
    });

    return { user_id: updated.user_id, role: updated.role, status: updated.status };
}

export async function removeMember(
    tx: TenantClient,
    session: Session,
    targetUserId: string,
    meta: RequestMeta = {},
): Promise<void> {
    const actorRole = await requireRole(tx, session, ["owner", "admin"]);

    const membership = await findMembership(tx, session.organizationId, targetUserId);
    if (!membership) {
        throw notFound("Membro");
    }

    await assertCanActOnOwner(tx, session.organizationId, actorRole, membership.role);

    await deleteMember(tx, session.organizationId, targetUserId);

    await recordAudit(tx, session, meta, {
        action: "member.removed",
        entityType: "organization_member",
        entityId: targetUserId,
        beforeData: { role: membership.role, status: membership.status },
    });
}
