import type { TenantClient } from "@/lib/tenant/with-tenant";
import {
    createDeliveries,
    findEnabledChannelIds,
    findLastSentAt,
    findMatchingRules,
    findUnprocessedEvents,
    type CreateDeliveryData,
} from "@/models/notification-delivery.model";
import { findMonitorNotificationCooldown } from "@/models/monitor.model";

// event_codes de recuperacao (mesma dupla usada em src/worker/event.model.ts)
// -- so geram entrega quando a regra tem notify_recovery = true.
const RECOVERY_EVENT_CODES = new Set(["monitor.up", "incident.resolved"]);

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

// Roda com o role da API (hawkdot_app) -- o worker (hawkdot_worker) nao tem
// GRANT em notification_rules/notification_channels/notification_deliveries
// de proposito (ver schema.sql): o worker so emite eventos (#38), quem
// consome e decide entregas e essa camada, sempre dentro do withTenant do
// usuario/organizacao dona do evento.
//
// Cooldown: quando a regra tem monitor_id (especifica de um monitor) E o
// evento tambem tem monitor_id, aplicamos o MAIOR entre
// rule.cooldown_seconds e monitors.notification_cooldown_seconds -- decisao
// deliberada de ficar do lado de "notificar menos", nao mais, quando os
// dois limiares existem e discordam. Regra geral (sem monitor_id) usa so o
// cooldown da propria regra.
export async function processPendingEvents(
    tx: TenantClient,
    organizationId: string,
): Promise<{ processed: number }> {
    const events = await findUnprocessedEvents(tx, organizationId);
    let processed = 0;

    for (const event of events) {
        const rules = await findMatchingRules(tx, organizationId, event.event_code, event.monitor_id);
        const deliveries: CreateDeliveryData[] = [];

        for (const rule of rules) {
            const enabledChannelIds = await findEnabledChannelIds(tx, rule.channelIds);
            if (enabledChannelIds.size === 0) {
                continue;
            }

            const isRecovery = RECOVERY_EVENT_CODES.has(event.event_code);
            if (isRecovery && !rule.notifyRecovery) {
                continue;
            }
            if (SEVERITY_RANK[event.severity] < SEVERITY_RANK[rule.minimumSeverity]) {
                continue;
            }

            const monitorCooldown = event.monitor_id
                ? await findMonitorNotificationCooldown(tx, event.monitor_id)
                : null;
            const cooldownSeconds =
                event.monitor_id && monitorCooldown !== null
                    ? Math.max(rule.cooldownSeconds, monitorCooldown)
                    : rule.cooldownSeconds;

            for (const channelId of enabledChannelIds) {
                const lastSentAt = await findLastSentAt(tx, rule.id, channelId);
                const withinCooldown =
                    lastSentAt !== null &&
                    Date.now() - lastSentAt.getTime() < cooldownSeconds * 1000;

                deliveries.push({
                    organizationId,
                    eventId: event.id,
                    ruleId: rule.id,
                    channelId,
                    status: withinCooldown ? "skipped" : "pending",
                });
            }
        }

        await createDeliveries(tx, deliveries);
        processed += 1;
    }

    return { processed };
}
