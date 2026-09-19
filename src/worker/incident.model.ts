import type { WorkerTenantClient } from "@/worker/with-worker-tenant";

// incidents_one_active_per_monitor_idx (UNIQUE parcial em
// organization_id, monitor_id WHERE status IN ('open','acknowledged'))
// garante no maximo um incidente ativo por monitor -- a logica do #37
// sempre confere findActiveIncident() antes de abrir um novo, mas o
// indice e quem garante isso de verdade se algo escapar.
export function findActiveIncident(tx: WorkerTenantClient, monitorId: string) {
    return tx.incidents.findFirst({
        where: { monitor_id: monitorId, status: { in: ["open", "acknowledged"] } },
    });
}

export type OpenIncidentData = {
    organizationId: string;
    monitorId: string;
    title: string;
    cause: string;
    openedByExecutionId: string;
};

export function openIncident(tx: WorkerTenantClient, data: OpenIncidentData) {
    return tx.incidents.create({
        data: {
            organization_id: data.organizationId,
            monitor_id: data.monitorId,
            status: "open",
            title: data.title,
            cause: data.cause,
            opened_by_execution_id: data.openedByExecutionId,
        },
    });
}

// incidents_resolution_consistency exige resolved_at preenchido exatamente
// quando status = 'resolved' -- os dois campos mudam juntos, nunca um sem o
// outro.
export function resolveIncident(
    tx: WorkerTenantClient,
    incidentId: string,
    resolvedByExecutionId: string,
) {
    return tx.incidents.update({
        where: { id: incidentId },
        data: {
            status: "resolved",
            resolved_at: new Date(),
            resolved_by_execution_id: resolvedByExecutionId,
        },
    });
}
