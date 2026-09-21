import { apiClient } from "@/lib/api/client";
import type {
    HttpConfig,
    MonitorListResult,
    MonitorResult,
    MonitorState,
    MonitorStatus,
    MonitorType,
    PingConfig,
    SslConfig,
} from "@/lib/api/types";

export type ListMonitorsParams = {
    q?: string;
    page?: number;
    per_page?: number;
    monitor_type?: MonitorType;
    status?: MonitorStatus;
    current_state?: MonitorState;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : "";
}

type CommonMonitorFields = {
    resource_id: string;
    name: string;
    interval_seconds?: number;
    timeout_seconds?: number;
    failure_threshold?: number;
    recovery_threshold?: number;
    notification_cooldown_seconds?: number;
};

export type CreateMonitorInput =
    | (CommonMonitorFields & { monitor_type: "ssl"; config: SslConfig })
    | (CommonMonitorFields & { monitor_type: "http"; config: HttpConfig })
    | (CommonMonitorFields & { monitor_type: "ping"; config: PingConfig });

export type UpdateMonitorInput = Partial<{
    name: string;
    interval_seconds: number;
    timeout_seconds: number;
    failure_threshold: number;
    recovery_threshold: number;
    notification_cooldown_seconds: number;
    status: MonitorStatus;
    config: Record<string, unknown>;
}>;

export const monitorsApi = {
    list: (params: ListMonitorsParams = {}, signal?: AbortSignal) => apiClient.get<MonitorListResult>(`/api/monitors${buildQuery(params)}`, signal),
    get: (id: string, signal?: AbortSignal) => apiClient.get<MonitorResult>(`/api/monitors/${id}`, signal),
    create: (data: CreateMonitorInput) => apiClient.post<MonitorResult>("/api/monitors", data),
    update: (id: string, data: UpdateMonitorInput) => apiClient.patch<MonitorResult>(`/api/monitors/${id}`, data),
    remove: (id: string) => apiClient.delete(`/api/monitors/${id}`),
};
