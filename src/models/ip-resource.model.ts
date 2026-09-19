import type { TenantClient } from "@/lib/tenant/with-tenant";

export function createIpResource(
    tx: TenantClient,
    params: { resourceId: string; organizationId: string; address: string },
) {
    return tx.ip_resources.create({
        data: {
            resource_id: params.resourceId,
            organization_id: params.organizationId,
            address: params.address,
        },
    });
}

export function findIpResource(tx: TenantClient, resourceId: string) {
    return tx.ip_resources.findUnique({ where: { resource_id: resourceId } });
}

export function updateIpResource(tx: TenantClient, resourceId: string, address: string) {
    return tx.ip_resources.update({ where: { resource_id: resourceId }, data: { address } });
}
