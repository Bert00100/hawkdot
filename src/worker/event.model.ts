import type { Prisma } from "@/generated/prisma/client";
import type { WorkerTenantClient } from "@/worker/with-worker-tenant";

// Vocabulario de event_code (issue #38) -- e o ponto de desacoplamento entre
// o worker e o motor de notificacoes (M7): o worker so emite, quem consome
// e configura regras por cima e a M7. Adicionar um canal de notificacao novo
// nunca exige mexer aqui.
//
//   monitor.down      (critical) -- monitor cruzou failure_threshold
//   monitor.up        (info)     -- monitor cruzou recovery_threshold
//   incident.opened   (critical) -- mesmo instante de monitor.down, sobre o incidente em si
//   incident.resolved (info)     -- mesmo instante de monitor.up
//   ssl.expiring      (warning)  -- certificado cruzou um warning_days, deduplicado por faixa
export const EVENT_CODES = {
    MONITOR_DOWN: "monitor.down",
    MONITOR_UP: "monitor.up",
    INCIDENT_OPENED: "incident.opened",
    INCIDENT_RESOLVED: "incident.resolved",
    SSL_EXPIRING: "ssl.expiring",
} as const;

export type EventCode = (typeof EVENT_CODES)[keyof typeof EVENT_CODES];
export type EventSeverity = "info" | "warning" | "critical";

export type CreateEventData = {
    organizationId: string;
    monitorId?: string;
    incidentId?: string;
    executionId?: string;
    eventCode: EventCode;
    severity: EventSeverity;
    message: string;
    payload?: Record<string, unknown>;
};

// events_payload_object exige objeto JSON -- payload sempre default {}
// quando nao informado, nunca null/array/primitivo solto.
export function createEvent(tx: WorkerTenantClient, data: CreateEventData) {
    return tx.events.create({
        data: {
            organization_id: data.organizationId,
            monitor_id: data.monitorId,
            incident_id: data.incidentId,
            execution_id: data.executionId,
            event_code: data.eventCode,
            severity: data.severity,
            message: data.message,
            payload: (data.payload ?? {}) as Prisma.InputJsonValue,
        },
    });
}

// Usado para deduplicar ssl.expiring -- ver src/worker/ssl-expiry-events.ts.
export function findLastEvent(tx: WorkerTenantClient, monitorId: string, eventCode: EventCode) {
    return tx.events.findFirst({
        where: { monitor_id: monitorId, event_code: eventCode },
        orderBy: { happened_at: "desc" },
    });
}
