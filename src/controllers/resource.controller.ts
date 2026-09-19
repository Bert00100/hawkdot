import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole, type MemberRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import {
    countResources,
    createResourceParent,
    deleteResourceParent,
    findResourceById,
    listResources,
    updateResourceParent,
    type ResourceType,
} from "@/models/resource.model";
import {
    createDomainResource,
    findDomainResource,
    updateDomainResource,
} from "@/models/domain-resource.model";
import {
    createEndpointResource,
    findEndpointResource,
    updateEndpointResource,
} from "@/models/endpoint-resource.model";
import { createIpResource, findIpResource, updateIpResource } from "@/models/ip-resource.model";
import type {
    CreateDomainResourceInput,
    CreateEndpointResourceInput,
    CreateIpResourceInput,
    UpdateDomainResourceInput,
    UpdateEndpointResourceInput,
    UpdateIpResourceInput,
} from "@/lib/dto/resource.dto";

// Escrita (create/update/delete) exige owner/admin/operator, espelhando
// tenant_app_insert/update/delete. Leitura e livre para qualquer membro
// ativo (tenant_app_select).
const WRITE_ROLES: MemberRole[] = ["owner", "admin", "operator"];

export type DomainResourceResult = {
    id: string;
    display_name: string;
    environment: string;
    status: string;
    fqdn: string;
};

export async function createDomain(
    tx: TenantClient,
    session: Session,
    input: CreateDomainResourceInput,
): Promise<DomainResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const resourceId = randomUUID();
    const resource = await createResourceParent(tx, {
        id: resourceId,
        organizationId: session.organizationId,
        resourceType: "domain",
        displayName: input.display_name,
        environment: input.environment,
    });
    const domain = await createDomainResource(tx, {
        resourceId,
        organizationId: session.organizationId,
        fqdn: input.fqdn,
    });

    return shapeDomain(resource, domain);
}

export async function getDomain(tx: TenantClient, id: string): Promise<DomainResourceResult> {
    const resource = await findResourceById(tx, id);
    const domain = resource ? await findDomainResource(tx, id) : null;

    if (!resource || !domain) {
        throw notFound("Recurso");
    }

    return shapeDomain(resource, domain);
}

export async function updateDomain(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateDomainResourceInput,
): Promise<DomainResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    const resource =
        input.display_name !== undefined || input.environment !== undefined
            ? await updateResourceParent(tx, id, {
                  displayName: input.display_name,
                  environment: input.environment,
              })
            : existing;

    const domain =
        input.fqdn !== undefined
            ? await updateDomainResource(tx, id, input.fqdn)
            : await findDomainResource(tx, id);

    if (!domain) {
        throw notFound("Recurso");
    }

    return shapeDomain(resource, domain);
}

export async function deleteDomain(tx: TenantClient, session: Session, id: string): Promise<void> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    await deleteResourceParent(tx, id);
}

function shapeDomain(
    resource: { id: string; display_name: string; environment: string; status: string },
    domain: { fqdn: string },
): DomainResourceResult {
    return {
        id: resource.id,
        display_name: resource.display_name,
        environment: resource.environment,
        status: resource.status,
        fqdn: domain.fqdn,
    };
}

export type EndpointResourceResult = {
    id: string;
    display_name: string;
    environment: string;
    status: string;
    url: string;
};

export async function createEndpoint(
    tx: TenantClient,
    session: Session,
    input: CreateEndpointResourceInput,
): Promise<EndpointResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const resourceId = randomUUID();
    const resource = await createResourceParent(tx, {
        id: resourceId,
        organizationId: session.organizationId,
        resourceType: "url_endpoint",
        displayName: input.display_name,
        environment: input.environment,
    });
    const endpoint = await createEndpointResource(tx, {
        resourceId,
        organizationId: session.organizationId,
        url: input.url,
    });

    return shapeEndpoint(resource, endpoint);
}

export async function getEndpoint(tx: TenantClient, id: string): Promise<EndpointResourceResult> {
    const resource = await findResourceById(tx, id);
    const endpoint = resource ? await findEndpointResource(tx, id) : null;

    if (!resource || !endpoint) {
        throw notFound("Recurso");
    }

    return shapeEndpoint(resource, endpoint);
}

export async function updateEndpoint(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateEndpointResourceInput,
): Promise<EndpointResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    const resource =
        input.display_name !== undefined || input.environment !== undefined
            ? await updateResourceParent(tx, id, {
                  displayName: input.display_name,
                  environment: input.environment,
              })
            : existing;

    const endpoint =
        input.url !== undefined
            ? await updateEndpointResource(tx, id, input.url)
            : await findEndpointResource(tx, id);

    if (!endpoint) {
        throw notFound("Recurso");
    }

    return shapeEndpoint(resource, endpoint);
}

export async function deleteEndpoint(tx: TenantClient, session: Session, id: string): Promise<void> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    await deleteResourceParent(tx, id);
}

function shapeEndpoint(
    resource: { id: string; display_name: string; environment: string; status: string },
    endpoint: { url: string },
): EndpointResourceResult {
    return {
        id: resource.id,
        display_name: resource.display_name,
        environment: resource.environment,
        status: resource.status,
        url: endpoint.url,
    };
}

export type IpResourceResult = {
    id: string;
    display_name: string;
    environment: string;
    status: string;
    address: string;
};

export async function createIp(
    tx: TenantClient,
    session: Session,
    input: CreateIpResourceInput,
): Promise<IpResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const resourceId = randomUUID();
    const resource = await createResourceParent(tx, {
        id: resourceId,
        organizationId: session.organizationId,
        resourceType: "ip",
        displayName: input.display_name,
        environment: input.environment,
    });
    const ip = await createIpResource(tx, {
        resourceId,
        organizationId: session.organizationId,
        address: input.address,
    });

    return shapeIp(resource, ip);
}

export async function getIp(tx: TenantClient, id: string): Promise<IpResourceResult> {
    const resource = await findResourceById(tx, id);
    const ip = resource ? await findIpResource(tx, id) : null;

    if (!resource || !ip) {
        throw notFound("Recurso");
    }

    return shapeIp(resource, ip);
}

export async function updateIp(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateIpResourceInput,
): Promise<IpResourceResult> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    const resource =
        input.display_name !== undefined || input.environment !== undefined
            ? await updateResourceParent(tx, id, {
                  displayName: input.display_name,
                  environment: input.environment,
              })
            : existing;

    const ip =
        input.address !== undefined
            ? await updateIpResource(tx, id, input.address)
            : await findIpResource(tx, id);

    if (!ip) {
        throw notFound("Recurso");
    }

    return shapeIp(resource, ip);
}

export async function deleteIp(tx: TenantClient, session: Session, id: string): Promise<void> {
    await requireRole(tx, session, WRITE_ROLES);

    const existing = await findResourceById(tx, id);
    if (!existing) {
        throw notFound("Recurso");
    }

    await deleteResourceParent(tx, id);
}

function shapeIp(
    resource: { id: string; display_name: string; environment: string; status: string },
    ip: { address: string },
): IpResourceResult {
    return {
        id: resource.id,
        display_name: resource.display_name,
        environment: resource.environment,
        status: resource.status,
        address: ip.address,
    };
}

export type ResourceListItem = {
    id: string;
    resource_type: string;
    display_name: string;
    environment: string;
    status: string;
};

export type ResourceListResult = {
    items: ResourceListItem[];
    page: number;
    per_page: number;
    total: number;
};

export async function listResourcesController(
    tx: TenantClient,
    query: { page: number; per_page: number; resource_type?: ResourceType; status?: "active" | "paused" | "archived"; environment?: "production" | "staging" | "development" | "other" },
): Promise<ResourceListResult> {
    const offset = (query.page - 1) * query.per_page;
    const filters = {
        resourceType: query.resource_type,
        status: query.status,
        environment: query.environment,
    };

    const [resources, total] = await Promise.all([
        listResources(tx, filters, { limit: query.per_page, offset }),
        countResources(tx, filters),
    ]);

    return {
        items: resources.map((r) => ({
            id: r.id,
            resource_type: r.resource_type,
            display_name: r.display_name,
            environment: r.environment,
            status: r.status,
        })),
        page: query.page,
        per_page: query.per_page,
        total,
    };
}
