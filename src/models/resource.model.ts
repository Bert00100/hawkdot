import type { TenantClient } from "@/lib/tenant/with-tenant";

// Padrao pai+filho (issue #26): `resources` guarda o comum a todo recurso;
// cada tabela filha (domain_resources, endpoint_resources, ip_resources)
// guarda os campos especificos, amarrada por FK composta
// (resource_id, organization_id, resource_type) -- por isso todo insert de
// filha precisa do MESMO resource_type usado aqui no pai, ou a FK recusa.
//
// Diferente do bootstrap do signup (#14) e do aceite de convite (#24), aqui
// NAO ha problema de RETURNING: quem cria/le/atualiza um recurso ja e
// membro ativo da organizacao (passou por requireRole ou pelo menos por
// withSession), entao tenant_app_select ja enxerga a linha sem circularidade.
// Por isso os models usam .create()/.update() normais do Prisma.
export type ResourceType = "domain" | "ip" | "url_endpoint";

export type CreateResourceParentData = {
    id: string;
    organizationId: string;
    resourceType: ResourceType;
    displayName: string;
    environment: "production" | "staging" | "development" | "other";
};

export function createResourceParent(tx: TenantClient, data: CreateResourceParentData) {
    return tx.resources.create({
        data: {
            id: data.id,
            organization_id: data.organizationId,
            resource_type: data.resourceType,
            display_name: data.displayName,
            environment: data.environment,
        },
    });
}

export function findResourceById(tx: TenantClient, id: string) {
    return tx.resources.findUnique({ where: { id } });
}

export type UpdateResourceParentData = Partial<{
    displayName: string;
    environment: "production" | "staging" | "development" | "other";
}>;

export function updateResourceParent(tx: TenantClient, id: string, data: UpdateResourceParentData) {
    return tx.resources.update({
        where: { id },
        data: {
            ...(data.displayName !== undefined ? { display_name: data.displayName } : {}),
            ...(data.environment !== undefined ? { environment: data.environment } : {}),
        },
    });
}

// ON DELETE CASCADE na FK composta cuida da linha filha.
export function deleteResourceParent(tx: TenantClient, id: string) {
    return tx.resources.delete({ where: { id } });
}

export type ListResourcesFilters = {
    query?: string;
    resourceType?: ResourceType;
    status?: "active" | "paused" | "archived";
    environment?: "production" | "staging" | "development" | "other";
};

// Filtros na mesma ordem do indice resources_org_type_status_idx
// (organization_id, resource_type, status) -- organization_id ja vem do
// RLS (tenant_app_select), entao so importa a ordem resource_type -> status
// aqui para o Postgres conseguir usar o indice.
function whereFromFilters(filters: ListResourcesFilters) {
    return {
        ...(filters.query ? { display_name: { contains: filters.query, mode: "insensitive" as const } } : {}),
        ...(filters.resourceType ? { resource_type: filters.resourceType } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.environment ? { environment: filters.environment } : {}),
    };
}

export function listResources(
    tx: TenantClient,
    filters: ListResourcesFilters,
    pagination: { limit: number; offset: number },
) {
    return tx.resources.findMany({
        where: whereFromFilters(filters),
        orderBy: { created_at: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
    });
}

export function countResources(tx: TenantClient, filters: ListResourcesFilters) {
    return tx.resources.count({ where: whereFromFilters(filters) });
}
