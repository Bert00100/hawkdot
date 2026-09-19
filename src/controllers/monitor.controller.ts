import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound, validationError } from "@/lib/errors";
import { parseInput } from "@/lib/dto";
import {
    createMonitor,
    deleteMonitor,
    findMonitorById,
    updateMonitor,
} from "@/models/monitor.model";
import {
    createHttpConfig,
    createPingConfig,
    createSslConfig,
    findHttpConfig,
    findPingConfig,
    findSslConfig,
    updateHttpConfig,
    updatePingConfig,
    updateSslConfig,
} from "@/models/monitor-config.model";
import { monitorConfigUpdateSchemas } from "@/lib/dto/monitor.dto";
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
    config: unknown;
};

type MonitorRow = {
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

function shape(monitor: MonitorRow, config: unknown): MonitorResult {
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
        config,
    };
}

// Busca o config na tabela certa para o monitor_type -- e o unico lugar que
// precisa saber sobre as 3 tabelas *_monitor_configs do MVP.
async function findConfig(tx: TenantClient, monitorId: string, monitorType: string): Promise<unknown> {
    switch (monitorType) {
        case "ssl":
            return findSslConfig(tx, monitorId);
        case "http":
            return findHttpConfig(tx, monitorId);
        case "ping":
            return findPingConfig(tx, monitorId);
        default:
            return null;
    }
}

export async function createMonitorController(
    tx: TenantClient,
    session: Session,
    input: CreateMonitorInput,
): Promise<MonitorResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const monitorId = randomUUID();
    const monitor = await createMonitor(tx, {
        id: monitorId,
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

    let config: unknown;
    if (input.monitor_type === "ssl") {
        config = await createSslConfig(tx, monitorId, session.organizationId, input.config);
    } else if (input.monitor_type === "http") {
        config = await createHttpConfig(tx, monitorId, session.organizationId, input.config);
    } else {
        config = await createPingConfig(tx, monitorId, session.organizationId, input.config);
    }

    return shape(monitor, config);
}

export async function getMonitor(tx: TenantClient, id: string): Promise<MonitorResult> {
    const monitor = await findMonitorById(tx, id);
    if (!monitor) {
        throw notFound("Monitor");
    }

    const config = await findConfig(tx, id, monitor.monitor_type);
    if (!config) {
        throw notFound("Monitor");
    }

    return shape(monitor, config);
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

    let config: unknown;
    if (input.config) {
        // Ramifica no monitor_type ANTES de escolher schema+funcao juntos --
        // ler os dois de um Record por uma chave so faz o TS perder a relacao
        // entre eles (schema de ssl aplicado a updateHttpConfig, etc.).
        if (existing.monitor_type === "ssl") {
            config = await updateSslConfig(tx, id, parseInput(monitorConfigUpdateSchemas.ssl, input.config));
        } else if (existing.monitor_type === "http") {
            config = await updateHttpConfig(tx, id, parseInput(monitorConfigUpdateSchemas.http, input.config));
        } else if (existing.monitor_type === "ping") {
            config = await updatePingConfig(tx, id, parseInput(monitorConfigUpdateSchemas.ping, input.config));
        } else {
            throw validationError(`Tipo de monitor sem config editavel: ${existing.monitor_type}.`);
        }
    } else {
        config = await findConfig(tx, id, existing.monitor_type);
    }

    return shape(monitor, config);
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
