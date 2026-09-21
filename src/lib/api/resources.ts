import { apiClient } from "@/lib/api/client";
import type {
    ResourceEnvironment,
    ResourceListResult,
    ResourceStatus,
    ResourceType,
} from "@/lib/api/types";

export type ListResourcesParams = {
    q?: string;
    page?: number;
    per_page?: number;
    resource_type?: ResourceType;
    status?: ResourceStatus;
    environment?: ResourceEnvironment;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : "";
}

export type CreateDomainInput = { display_name: string; environment: ResourceEnvironment; fqdn: string };
export type CreateEndpointInput = { display_name: string; environment: ResourceEnvironment; url: string };
export type CreateIpInput = { display_name: string; environment: ResourceEnvironment; address: string };

export const resourcesApi = {
    list: (params: ListResourcesParams = {}, signal?: AbortSignal) => apiClient.get<ResourceListResult>(`/api/resources${buildQuery(params)}`, signal),
    createDomain: (data: CreateDomainInput) => apiClient.post("/api/resources/domains", data),
    createEndpoint: (data: CreateEndpointInput) => apiClient.post("/api/resources/endpoints", data),
    createIp: (data: CreateIpInput) => apiClient.post("/api/resources/ips", data),
    deleteDomain: (id: string) => apiClient.delete(`/api/resources/domains/${id}`),
    deleteEndpoint: (id: string) => apiClient.delete(`/api/resources/endpoints/${id}`),
    deleteIp: (id: string) => apiClient.delete(`/api/resources/ips/${id}`),
};

// A rota de delete depende do tipo do recurso (a API separa por
// sub-recurso, igual a de criacao) -- centraliza aqui pra quem consome so
// precisar saber o resource_type, nao a rota exata.
export function deleteResourceByType(resourceType: ResourceType, id: string) {
    if (resourceType === "domain") return resourcesApi.deleteDomain(id);
    if (resourceType === "url_endpoint") return resourcesApi.deleteEndpoint(id);
    return resourcesApi.deleteIp(id);
}
