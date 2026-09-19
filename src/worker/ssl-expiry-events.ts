import type { WorkerTenantClient } from "@/worker/with-worker-tenant";
import { createEvent, findLastEvent, EVENT_CODES } from "@/worker/event.model";

// Deduplicacao do aviso de expiracao de SSL (#38): um certificado a 30 dias
// do vencimento, checado a cada 5 minutos, geraria centenas de eventos por
// dia sem isso. Estrategia escolhida: emitir uma vez por FAIXA de
// warning_days cruzada, nao uma vez por check.
//
// warning_days e uma lista como [30, 14, 7, 3, 1] -- a faixa atual e o
// menor valor da lista que ainda e >= daysRemaining (o limiar mais urgente
// ja cruzado). So emite de novo quando a faixa fica MAIS urgente que a do
// ultimo evento emitido para este monitor -- nunca por regredir (nao deveria
// acontecer com um certificado, que so caminha para a expiracao) nem por
// permanecer na mesma faixa.
function mostUrgentCrossedThreshold(daysRemaining: number, warningDays: number[]): number | null {
    const cruzados = warningDays.filter((dias) => daysRemaining <= dias);
    if (cruzados.length === 0) return null;

    return Math.min(...cruzados);
}

export async function maybeEmitSslExpiring(
    tx: WorkerTenantClient,
    params: {
        organizationId: string;
        monitorId: string;
        executionId: string;
        daysRemaining: number;
        warningDays: number[];
    },
): Promise<void> {
    const faixaAtual = mostUrgentCrossedThreshold(params.daysRemaining, params.warningDays);
    if (faixaAtual === null) return; // ainda fora de qualquer faixa de aviso

    const ultimoEvento = await findLastEvent(tx, params.monitorId, EVENT_CODES.SSL_EXPIRING);
    const faixaAnterior =
        ultimoEvento && typeof ultimoEvento.payload === "object" && ultimoEvento.payload !== null
            ? (ultimoEvento.payload as Record<string, unknown>).warning_threshold_days
            : undefined;

    if (typeof faixaAnterior === "number" && faixaAtual >= faixaAnterior) {
        return; // mesma faixa (ou mais frouxa) do ultimo aviso -- nao reemite
    }

    await createEvent(tx, {
        organizationId: params.organizationId,
        monitorId: params.monitorId,
        executionId: params.executionId,
        eventCode: EVENT_CODES.SSL_EXPIRING,
        severity: params.daysRemaining <= 0 ? "critical" : "warning",
        message:
            params.daysRemaining <= 0
                ? "Certificado SSL expirado."
                : `Certificado SSL expira em ${params.daysRemaining} dia(s).`,
        payload: {
            days_remaining: params.daysRemaining,
            warning_threshold_days: faixaAtual,
        },
    });
}
