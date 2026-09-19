import type { WorkerTenantClient } from "@/worker/with-worker-tenant";
import { findActiveIncident, openIncident, resolveIncident } from "@/worker/incident.model";
import { createEvent, EVENT_CODES } from "@/worker/event.model";
import type { CheckResult } from "@/worker/checks/types";

// O coracao do produto (#37): transforma o resultado de UM check em estado
// do monitor e, quando cruza o limiar configurado, em incidente + eventos
// (#38 -- monitor.down/up e incident.opened/resolved, emitidos no mesmo
// instante da transicao).
//
// A logica opera sobre check_status (success vs failure/timeout/error), nao
// sobre observed_state -- um check SSL "degraded" (certificado perto de
// vencer) ainda e um check_status='success', entao NAO conta como falha
// para fins de threshold/incidente. O aviso de expiracao e um evento
// separado (ssl.expiring, ver src/worker/ssl-expiry-events.ts), nao um
// incidente de disponibilidade.
//
// Um unico check falho nao significa queda: pode ser um blip de rede. Por
// isso os contadores consecutive_failures/consecutive_successes so mudam o
// estado quando cruzam failure_threshold/recovery_threshold.
export async function applyCheckResult(
    tx: WorkerTenantClient,
    monitorId: string,
    executionId: string,
    result: CheckResult,
    checkedAt: Date,
): Promise<void> {
    const monitor = await tx.monitors.findUniqueOrThrow({ where: { id: monitorId } });
    const wasDown = monitor.current_state === "down";

    if (result.check_status === "success") {
        const consecutiveSuccesses = monitor.consecutive_successes + 1;
        const recovered = wasDown && consecutiveSuccesses >= monitor.recovery_threshold;

        if (recovered) {
            const incidente = await findActiveIncident(tx, monitorId);
            if (incidente) {
                const resolvido = await resolveIncident(tx, incidente.id, executionId);

                await createEvent(tx, {
                    organizationId: monitor.organization_id,
                    monitorId,
                    incidentId: resolvido.id,
                    executionId,
                    eventCode: EVENT_CODES.INCIDENT_RESOLVED,
                    severity: "info",
                    message: `Incidente de "${monitor.name}" resolvido.`,
                });
            }

            await createEvent(tx, {
                organizationId: monitor.organization_id,
                monitorId,
                executionId,
                eventCode: EVENT_CODES.MONITOR_UP,
                severity: "info",
                message: `"${monitor.name}" voltou a responder.`,
            });
        }

        await tx.monitors.update({
            where: { id: monitorId },
            data: {
                // Enquanto ainda 'down' sem ter atingido recovery_threshold,
                // o estado nao muda so por causa de um sucesso isolado.
                current_state: recovered ? "up" : wasDown ? "down" : result.observed_state,
                consecutive_successes: recovered ? 0 : consecutiveSuccesses,
                consecutive_failures: 0,
                last_check_at: checkedAt,
            },
        });
        return;
    }

    const consecutiveFailures = monitor.consecutive_failures + 1;
    const justWentDown = !wasDown && consecutiveFailures >= monitor.failure_threshold;

    if (justWentDown) {
        // findActiveIncident antes de abrir: a checagem em codigo melhora a
        // mensagem (evita um 409 cru do indice unico parcial), mas quem
        // garante "no maximo um incidente ativo" de verdade e o
        // incidents_one_active_per_monitor_idx no banco -- mesmo raciocinio
        // do requireRole (#20) complementando o RLS, nao substituindo.
        const jaAberto = await findActiveIncident(tx, monitorId);
        if (!jaAberto) {
            const incidente = await openIncident(tx, {
                organizationId: monitor.organization_id,
                monitorId,
                title: `${monitor.name} esta fora do ar`,
                cause: result.summary,
                openedByExecutionId: executionId,
            });

            await createEvent(tx, {
                organizationId: monitor.organization_id,
                monitorId,
                incidentId: incidente.id,
                executionId,
                eventCode: EVENT_CODES.INCIDENT_OPENED,
                severity: "critical",
                message: incidente.title,
            });

            await createEvent(tx, {
                organizationId: monitor.organization_id,
                monitorId,
                executionId,
                eventCode: EVENT_CODES.MONITOR_DOWN,
                severity: "critical",
                message: `"${monitor.name}" parou de responder.`,
                payload: { summary: result.summary },
            });
        }
    }

    await tx.monitors.update({
        where: { id: monitorId },
        data: {
            current_state: justWentDown || wasDown ? "down" : monitor.current_state,
            consecutive_failures: justWentDown ? 0 : consecutiveFailures,
            consecutive_successes: 0,
            last_check_at: checkedAt,
        },
    });
}
