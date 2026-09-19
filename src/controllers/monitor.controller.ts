import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import {
    createMonitor,
    deleteMonitor,
    findMonitorById,
    updateMonitor,
} from "@/models/monitor.model";
import type { CreateMonitorInput, UpdateMonitorInput } from "@/lib/dto/monitor.dto";

const WRITE_ROLES = ["owner", "admin", "operator"] as const;

export type MonitorResult = {
    id: string;
    resource_id: string;
    monitor_type: string;
    name: string;
    interval_seconds: number | null;
    timeout_seconds: number;
    failure_threshold: number;
    recovery_threshold: number;
    notification_cooldown_seconds: number;
    status: string;
    current_state: string;
};

function shape(monitor: {
    id: string;
    resource_id: string;
    monitor_type: string;
    name: string;
    interval_seconds: number | null;
    timeout_seconds: number;
    failure_threshold: number;
    recovery_threshold: number;
    notification_cooldown_seconds: number;
    status: string;
    current_state: string;
}): MonitorResult {
    return {
        id: monitor.id,
        resource_id: monitor.resource_id,
        monitor_type: monitor.monitor_type,
        name: monitor.name,
        interval_seconds: monitor.interval_seconds,
        timeout_seconds: monitor.timeout_seconds,
        failure_threshold: monitor.failure_threshold,
        recovery_threshold: monitor.recovery_threshold,
        notification_cooldown_seconds: monitor.notification_cooldown_seconds,
        status: monitor.status,
        current_state: monitor.current_state,
    };
}

export async function createMonitorController(
    tx: TenantClient,
    session: Session,
    input: CreateMonitorInput,
): Promise<MonitorResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const monitor = await createMonitor(tx, {
        id: randomUUID(),
        organizationId: session.organizationId,
        resourceId: input.resource_id,
        monitorType: input.monitor_type,
        name: input.name,
        intervalSeconds: input.interval_seconds,
        timeoutSeconds: input.timeout_seconds,
        failureThreshold: input.failure_threshold,
        recoveryThreshold: input.recovery_threshold,
        notificationCooldownSeconds: input.notification_cooldown_seconds,
    });

    return shape(monitor);
}

export async function getMonitor(tx: TenantClient, id: string): Promise<MonitorResult> {
    const monitor = await findMonitorById(tx, id);
    if (!monitor) {
        throw notFound("Monitor");
    }

    return shape(monitor);
}

export async function updateMonitorController(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateMonitorInput,
): Promise<MonitorResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findMonitorById(tx, id);
    if (!existing) {
        throw notFound("Monitor");
    }

    const monitor = await updateMonitor(tx, id, {
        name: input.name,
        intervalSeconds: input.interval_seconds,
        timeoutSeconds: input.timeout_seconds,
        failureThreshold: input.failure_threshold,
        recoveryThreshold: input.recovery_threshold,
        notificationCooldownSeconds: input.notification_cooldown_seconds,
        status: input.status,
    });

    return shape(monitor);
}

export async function deleteMonitorController(
    tx: TenantClient,
    session: Session,
    id: string,
): Promise<void> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findMonitorById(tx, id);
    if (!existing) {
        throw notFound("Monitor");
    }

    await deleteMonitor(tx, id);
}
