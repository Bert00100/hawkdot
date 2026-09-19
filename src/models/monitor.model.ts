import type { TenantClient } from "@/lib/tenant/with-tenant";

export type MonitorType = "ssl" | "http" | "ping";

export type CreateMonitorData = {
    id: string;
    organizationId: string;
    resourceId: string;
    monitorType: MonitorType;
    name: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
    recoveryThreshold: number;
    notificationCooldownSeconds: number;
};

// monitors_resource_tenant_fk garante que resource_id pertence a MESMA
// organizacao -- nao precisa de checagem manual, um resource_id de outra
// org vira 400 (FK violation) via translatePrismaError.
export function createMonitor(tx: TenantClient, data: CreateMonitorData) {
    return tx.monitors.create({
        data: {
            id: data.id,
            organization_id: data.organizationId,
            resource_id: data.resourceId,
            monitor_type: data.monitorType,
            name: data.name,
            execution_mode: "interval",
            interval_seconds: data.intervalSeconds,
            timeout_seconds: data.timeoutSeconds,
            failure_threshold: data.failureThreshold,
            recovery_threshold: data.recoveryThreshold,
            notification_cooldown_seconds: data.notificationCooldownSeconds,
            // monitors_due_idx (issue #34) filtra por next_check_at <= now()
            // -- sem isso, um monitor recem-criado ficaria com next_check_at
            // NULL e nunca seria pego pelo scheduler.
            next_check_at: new Date(),
        },
    });
}

export function findMonitorById(tx: TenantClient, id: string) {
    return tx.monitors.findUnique({ where: { id } });
}

export type UpdateMonitorData = Partial<{
    name: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
    recoveryThreshold: number;
    notificationCooldownSeconds: number;
    status: "active" | "paused" | "archived";
}>;

export function updateMonitor(tx: TenantClient, id: string, data: UpdateMonitorData) {
    return tx.monitors.update({
        where: { id },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.intervalSeconds !== undefined ? { interval_seconds: data.intervalSeconds } : {}),
            ...(data.timeoutSeconds !== undefined ? { timeout_seconds: data.timeoutSeconds } : {}),
            ...(data.failureThreshold !== undefined ? { failure_threshold: data.failureThreshold } : {}),
            ...(data.recoveryThreshold !== undefined ? { recovery_threshold: data.recoveryThreshold } : {}),
            ...(data.notificationCooldownSeconds !== undefined
                ? { notification_cooldown_seconds: data.notificationCooldownSeconds }
                : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
        },
    });
}

export function deleteMonitor(tx: TenantClient, id: string) {
    return tx.monitors.delete({ where: { id } });
}

export type ListMonitorsFilters = {
    monitorType?: MonitorType;
    status?: "active" | "paused" | "archived";
    currentState?: "unknown" | "up" | "down" | "degraded";
};

// Filtros na mesma ordem do indice monitors_org_state_idx
// (organization_id, current_state, status).
function whereFromFilters(filters: ListMonitorsFilters) {
    return {
        ...(filters.monitorType ? { monitor_type: filters.monitorType } : {}),
        ...(filters.currentState ? { current_state: filters.currentState } : {}),
        ...(filters.status ? { status: filters.status } : {}),
    };
}

export function listMonitors(
    tx: TenantClient,
    filters: ListMonitorsFilters,
    pagination: { limit: number; offset: number },
) {
    return tx.monitors.findMany({
        where: whereFromFilters(filters),
        orderBy: { created_at: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
    });
}

export function countMonitors(tx: TenantClient, filters: ListMonitorsFilters) {
    return tx.monitors.count({ where: whereFromFilters(filters) });
}

// Usado pelo motor de entrega (#41) para decidir o cooldown efetivo de uma
// notificacao especifica de monitor -- so essa coluna, nunca o monitor
// inteiro.
export async function findMonitorNotificationCooldown(
    tx: TenantClient,
    monitorId: string,
): Promise<number | null> {
    const monitor = await tx.monitors.findUnique({
        where: { id: monitorId },
        select: { notification_cooldown_seconds: true },
    });

    return monitor?.notification_cooldown_seconds ?? null;
}
