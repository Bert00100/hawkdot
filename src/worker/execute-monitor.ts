import { withWorkerTenant } from "@/worker/with-worker-tenant";
import { runCheck } from "@/worker/checks/run-check";
import type { ReservedMonitor } from "@/worker/scheduler.model";
import {
    findHttpCheckConfig,
    findPingCheckConfig,
    findSslCheckConfig,
} from "@/worker/monitor-config.model";
import { createMonitorExecution, updateMonitorLastCheck } from "@/worker/monitor-execution.model";

// Roda o check de UM monitor reservado (#34) e persiste o resultado (#36),
// tudo dentro da mesma withWorkerTenant() -- cada monitor abre sua propria
// transacao, entao um monitor lento nao trava os outros do lote.
export async function executeMonitor(reserved: ReservedMonitor): Promise<void> {
    if (reserved.monitor_type === "server_agent") {
        // Fora do escopo do MVP (so ssl/http/ping tem executor, #35).
        return;
    }

    await withWorkerTenant(reserved.organization_id, async (tx) => {
        const config =
            reserved.monitor_type === "ssl"
                ? await findSslCheckConfig(tx, reserved.id)
                : reserved.monitor_type === "http"
                  ? await findHttpCheckConfig(tx, reserved.id)
                  : await findPingCheckConfig(tx, reserved.id);

        if (!config) {
            // Nao deveria ser alcancavel: todo monitor criado pela API grava
            // a config junto, na mesma transacao (#31). Se acontecer (dado
            // inconsistente), so pula -- nao derruba o worker inteiro.
            console.error(
                `[worker] monitor ${reserved.id} (${reserved.monitor_type}) sem config -- pulando`,
            );
            return;
        }

        const startedAt = new Date();
        const result = await runCheck(
            reserved.monitor_type as "ssl" | "http" | "ping",
            config,
            reserved.timeout_seconds,
        );
        const finishedAt = new Date();

        await createMonitorExecution(tx, {
            organizationId: reserved.organization_id,
            monitorId: reserved.id,
            checkStatus: result.check_status,
            observedState: result.observed_state,
            startedAt,
            finishedAt,
            responseTimeMs: result.response_time_ms,
            summary: result.summary,
            details: result.details,
        });

        await updateMonitorLastCheck(tx, reserved.id, finishedAt);
    });
}
