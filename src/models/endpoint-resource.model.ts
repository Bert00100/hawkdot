import type { TenantClient } from "@/lib/tenant/with-tenant";

export function createEndpointResource(
    tx: TenantClient,
    params: { resourceId: string; organizationId: string; url: string },
) {
    return tx.endpoint_resources.create({
        data: {
            resource_id: params.resourceId,
            organization_id: params.organizationId,
            url: params.url,
        },
    });
}

export function findEndpointResource(tx: TenantClient, resourceId: string) {
    return tx.endpoint_resources.findUnique({ where: { resource_id: resourceId } });
}

export function updateEndpointResource(tx: TenantClient, resourceId: string, url: string) {
    return tx.endpoint_resources.update({ where: { resource_id: resourceId }, data: { url } });
}
