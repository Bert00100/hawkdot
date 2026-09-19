import type { Prisma } from "@/generated/prisma/client";
import type { WorkerTenantClient } from "@/worker/with-worker-tenant";
import type { CheckResult } from "@/worker/checks/types";

export type CreateExecutionData = {
    organizationId: string;
    monitorId: string;
    checkStatus: CheckResult["check_status"];
    observedState: CheckResult["observed_state"];
    startedAt: Date;
    finishedAt: Date;
    responseTimeMs: number | null;
    summary: string;
    details: Record<string, unknown>;
};

// monitor_execution_time_order exige finished_at >= started_at;
// monitor_execution_duration/response_time exigem >= 0 quando presentes --
// como duration_ms e sempre calculado aqui a partir de finishedAt-startedAt
// (nunca vem do executor), esses CHECKs nunca deveriam falhar na pratica.
export function createMonitorExecution(tx: WorkerTenantClient, data: CreateExecutionData) {
    return tx.monitor_executions.create({
        data: {
            organization_id: data.organizationId,
            monitor_id: data.monitorId,
            check_status: data.checkStatus,
            observed_state: data.observedState,
            started_at: data.startedAt,
            finished_at: data.finishedAt,
            duration_ms: Math.max(0, data.finishedAt.getTime() - data.startedAt.getTime()),
            response_time_ms: data.responseTimeMs,
            summary: data.summary,
            details: data.details as Prisma.InputJsonValue,
        },
    });
}

export function updateMonitorLastCheck(tx: WorkerTenantClient, monitorId: string, lastCheckAt: Date) {
    return tx.monitors.update({
        where: { id: monitorId },
        data: { last_check_at: lastCheckAt },
    });
}
