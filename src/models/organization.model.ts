import type { TenantClient } from "@/lib/tenant/with-tenant";

export type CreateOrganizationData = {
    id: string;
    name: string;
    slug: string;
};

// So roda dentro de withTenant() -- organizations_self_create exige
// id = current_organization_id() (setado antes do insert) e
// current_user_id() IS NOT NULL.
//
// Usa INSERT sem RETURNING de proposito. O `.create()` do Prisma faz
// INSERT ... RETURNING, e o Postgres avalia a policy de SELECT
// (organizations_member_select) sobre a linha retornada -- que exige
// is_organization_member(id), ainda falso neste momento do signup (#14),
// porque organization_members so e inserido depois. RETURNING sobre uma
// linha que nao passa no SELECT nao e silenciosamente omitido: da o MESMO
// erro 42501 do WITH CHECK ("new row violates row-level security policy"),
// mesmo com o INSERT em si sendo permitido. Por isso o signup busca a
// organizacao de volta com findOrganizationById() so depois de criar o
// membership (quando is_organization_member ja e verdadeiro).
export async function createOrganizationRecord(
    tx: TenantClient,
    data: CreateOrganizationData,
): Promise<void> {
    await tx.$executeRaw`
        INSERT INTO hawkdot.organizations (id, name, slug)
        VALUES (${data.id}::uuid, ${data.name}, ${data.slug})
    `;
}

export function findOrganizationById(tx: TenantClient, id: string) {
    return tx.organizations.findUnique({ where: { id } });
}

export type UpdateOrganizationData = Partial<{
    name: string;
    slug: string;
    kind: "personal" | "company";
}>;

// Update normal (com RETURNING): diferente do insert do signup, aqui o
// usuario ja e membro ativo da organizacao havia antes da chamada --
// organizations_member_select ja enxerga a linha sem o problema circular
// do bootstrap.
export function updateOrganizationRecord(
    tx: TenantClient,
    id: string,
    data: UpdateOrganizationData,
) {
    return tx.organizations.update({ where: { id }, data });
}
