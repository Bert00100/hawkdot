export type Me = {
    user: { id: string; email: string; display_name: string };
    organization: { id: string; name: string; slug: string; role: string };
    organizations: { id: string; name: string; slug: string; role: string }[];
};

export type ResourceType = "domain" | "url_endpoint" | "ip";
export type ResourceEnvironment = "production" | "staging" | "development" | "other";
export type ResourceStatus = "active" | "paused" | "archived";

export type ResourceListItem = {
    id: string;
    resource_type: ResourceType;
    display_name: string;
    environment: ResourceEnvironment;
    status: ResourceStatus;
};

export type ResourceListResult = {
    items: ResourceListItem[];
    page: number;
    per_page: number;
    total: number;
};

export type MonitorType = "ssl" | "http" | "ping";
export type MonitorStatus = "active" | "paused" | "archived";
export type MonitorState = "unknown" | "up" | "down" | "degraded";

export type MonitorObservation = {
    last_check_at: string | null;
    next_check_at: string | null;
    last_execution: {
        check_status: string;
        started_at: string;
        finished_at: string | null;
        response_time_ms: number | null;
        summary: string | null;
    } | null;
};

export type MonitorResult = MonitorObservation & {
    id: string;
    resource_id: string;
    monitor_type: MonitorType;
    name: string;
    interval_seconds: number | null;
    timeout_seconds: number;
    failure_threshold: number;
    recovery_threshold: number;
    notification_cooldown_seconds: number;
    status: MonitorStatus;
    current_state: MonitorState;
    config: unknown;
};

export type MonitorListItem = MonitorObservation & {
    id: string;
    resource_id: string;
    monitor_type: MonitorType;
    name: string;
    status: MonitorStatus;
    current_state: MonitorState;
};

export type MonitorListResult = {
    items: MonitorListItem[];
    page: number;
    per_page: number;
    total: number;
};

export type SslConfig = {
    hostname: string;
    port: number;
    sni_name?: string;
    verify_chain: boolean;
    verify_hostname: boolean;
    warning_days: number[];
};

export type HttpConfig = {
    url: string;
    method: "GET" | "HEAD" | "POST";
    request_headers: Record<string, string>;
    request_body?: string;
    expected_status_min: number;
    expected_status_max: number;
    expected_body_contains?: string;
    follow_redirects: boolean;
};

export type PingConfig = {
    host: string;
    packet_count: number;
    max_packet_loss_percent: number;
};
