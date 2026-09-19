import type { TenantClient } from "@/lib/tenant/with-tenant";

export function createDomainResource(
    tx: TenantClient,
    params: { resourceId: string; organizationId: string; fqdn: string },
) {
    return tx.domain_resources.create({
        data: {
            resource_id: params.resourceId,
            organization_id: params.organizationId,
            fqdn: params.fqdn,
        },
    });
}

export function findDomainResource(tx: TenantClient, resourceId: string) {
    return tx.domain_resources.findUnique({ where: { resource_id: resourceId } });
}

export function updateDomainResource(tx: TenantClient, resourceId: string, fqdn: string) {
    return tx.domain_resources.update({ where: { resource_id: resourceId }, data: { fqdn } });
}
