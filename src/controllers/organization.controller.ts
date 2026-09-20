import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { findOrganizationById, updateOrganizationRecord } from "@/models/organization.model";
import { notFound } from "@/lib/errors";
import { recordAudit, type RequestMeta } from "@/lib/audit/record-audit";
import type { UpdateOrganizationInput } from "@/lib/dto/organization.dto";

export type OrganizationResult = {
    id: string;
    name: string;
    slug: string;
    kind: string;
    status: string;
};

function shape(org: { id: string; name: string; slug: string; kind: string; status: string }): OrganizationResult {
    return { id: org.id, name: org.name, slug: org.slug, kind: org.kind, status: org.status };
}

// Leitura: qualquer membro ativo (tenant_app_select / organizations_member_select
// nao restringem por papel) -- nao precisa de requireRole.
export async function getActiveOrganization(
    tx: TenantClient,
    session: Session,
): Promise<OrganizationResult> {
    const organization = await findOrganizationById(tx, session.organizationId);
    if (!organization) {
        throw notFound("Organizacao");
    }

    return shape(organization);
}

// Escrita: so owner/admin (organizations_admin_update). `status` nunca
// aparece no DTO de entrada (updateOrganizationSchema) -- suspensao/
// arquivamento e operacao administrativa, nao de usuario.
export async function updateActiveOrganization(
    tx: TenantClient,
    session: Session,
    data: UpdateOrganizationInput,
    meta: RequestMeta = {},
): Promise<OrganizationResult> {
    await requireRole(tx, session, ["owner", "admin"]);

    const before = await findOrganizationById(tx, session.organizationId);
    const organization = await updateOrganizationRecord(tx, session.organizationId, data);

    await recordAudit(tx, session, meta, {
        action: "organization.updated",
        entityType: "organization",
        entityId: organization.id,
        beforeData: before ? { name: before.name, slug: before.slug } : null,
        afterData: { name: organization.name, slug: organization.slug },
    });

    return shape(organization);
}
