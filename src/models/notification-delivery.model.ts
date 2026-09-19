import type { TenantClient } from "@/lib/tenant/with-tenant";

export type PendingEvent = {
    id: string;
    monitor_id: string | null;
    event_code: string;
    severity: "info" | "warning" | "critical";
};

// "Novo" == ainda nao tem nenhuma linha em notification_deliveries. Cada
// evento e processado por inteiro numa so passada (todo canal casado vira
// uma linha 'pending' ou 'skipped', nunca so uma parte) -- por isso basta
// checar ausencia total de entregas para saber que ainda nao foi
// processado, sem precisar de uma coluna extra de "processado_em".
export function findUnprocessedEvents(tx: TenantClient, organizationId: string): Promise<PendingEvent[]> {
    return tx.events.findMany({
        where: { organization_id: organizationId, notification_deliveries: { none: {} } },
        select: { id: true, monitor_id: true, event_code: true, severity: true },
        orderBy: { happened_at: "asc" },
    });
}

export type MatchingRule = {
    id: string;
    cooldownSeconds: number;
    minimumSeverity: "info" | "warning" | "critical";
    notifyRecovery: boolean;
    channelIds: string[];
};

// Regras habilitadas cujo event_codes contem o codigo do evento e cujo
// monitor_id e nulo (regra geral) ou bate com o monitor do evento.
export async function findMatchingRules(
    tx: TenantClient,
    organizationId: string,
    eventCode: string,
    monitorId: string | null,
): Promise<MatchingRule[]> {
    const rules = await tx.notification_rules.findMany({
        where: {
            organization_id: organizationId,
            enabled: true,
            event_codes: { has: eventCode },
            OR: [{ monitor_id: null }, ...(monitorId ? [{ monitor_id: monitorId }] : [])],
        },
        select: {
            id: true,
            cooldown_seconds: true,
            minimum_severity: true,
            notify_recovery: true,
            notification_rule_channels: { select: { channel_id: true } },
        },
    });

    return rules.map((rule) => ({
        id: rule.id,
        cooldownSeconds: rule.cooldown_seconds,
        minimumSeverity: rule.minimum_severity,
        notifyRecovery: rule.notify_recovery,
        channelIds: rule.notification_rule_channels.map((c) => c.channel_id),
    }));
}

// So entrega em canal habilitado -- um canal desativado nao deveria gerar
// nem uma linha 'skipped', porque nao e um caso de cooldown.
export async function findEnabledChannelIds(tx: TenantClient, channelIds: string[]): Promise<Set<string>> {
    if (channelIds.length === 0) {
        return new Set();
    }

    const channels = await tx.notification_channels.findMany({
        where: { id: { in: channelIds }, enabled: true },
        select: { id: true },
    });

    return new Set(channels.map((c) => c.id));
}

// Cooldown = o mais recente envio 'sent' para o mesmo par regra+canal,
// dentro da janela. 'skipped'/'failed'/'pending' nao contam como envio
// para efeito de cooldown -- so um envio de fato feito justifica suprimir
// o proximo.
export async function findLastSentAt(
    tx: TenantClient,
    ruleId: string,
    channelId: string,
): Promise<Date | null> {
    const last = await tx.notification_deliveries.findFirst({
        where: { rule_id: ruleId, channel_id: channelId, status: "sent" },
        orderBy: { sent_at: "desc" },
        select: { sent_at: true },
    });

    return last?.sent_at ?? null;
}

export type CreateDeliveryData = {
    organizationId: string;
    eventId: string;
    ruleId: string;
    channelId: string;
    status: "pending" | "skipped";
};

// ON CONFLICT DO NOTHING via createMany+skipDuplicates -- o unique
// (organization_id, event_id, channel_id) e a garantia real de idempotencia
// (criterio de aceite: reprocessar o mesmo evento nao duplica entregas).
export function createDeliveries(tx: TenantClient, deliveries: CreateDeliveryData[]) {
    if (deliveries.length === 0) {
        return Promise.resolve({ count: 0 });
    }

    return tx.notification_deliveries.createMany({
        data: deliveries.map((d) => ({
            organization_id: d.organizationId,
            event_id: d.eventId,
            rule_id: d.ruleId,
            channel_id: d.channelId,
            status: d.status,
        })),
        skipDuplicates: true,
    });
}
