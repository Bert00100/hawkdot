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

export type DispatchableDelivery = {
    id: string;
    channel_id: string;
    attempt_count: number;
    channel_type: string;
    channel_credential_id: string | null;
    channel_safe_config: unknown;
};

// Usa o mesmo criterio do indice parcial notification_deliveries_pending_idx
// (status IN pending/failed) + attempt_count < 20 (CHECK
// notification_attempt_count permite ate 20; parar antes evita estourar a
// constraint) + next_attempt_at vencido ou nulo (primeira tentativa).
export function findDispatchableDeliveries(
    tx: TenantClient,
    organizationId: string,
    limit: number,
): Promise<DispatchableDelivery[]> {
    return tx.notification_deliveries
        .findMany({
            where: {
                organization_id: organizationId,
                status: { in: ["pending", "failed"] },
                attempt_count: { lt: 20 },
                OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: new Date() } }],
            },
            orderBy: { next_attempt_at: "asc" },
            take: limit,
            select: {
                id: true,
                channel_id: true,
                attempt_count: true,
                notification_channels: {
                    select: { channel_type: true, credential_id: true, safe_config: true },
                },
            },
        })
        .then((rows) =>
            rows.map((row) => ({
                id: row.id,
                channel_id: row.channel_id,
                attempt_count: row.attempt_count,
                channel_type: row.notification_channels.channel_type,
                channel_credential_id: row.notification_channels.credential_id,
                channel_safe_config: row.notification_channels.safe_config,
            })),
        );
}

export function markDeliverySent(tx: TenantClient, id: string, providerMessageId: string | undefined) {
    return tx.notification_deliveries.update({
        where: { id },
        data: {
            status: "sent",
            sent_at: new Date(),
            provider_message_id: providerMessageId,
            last_error: null,
            next_attempt_at: null,
        },
    });
}

// notification_attempt_count CHECK permite 0..20 -- ao chegar em 20,
// paramos de agendar retry (next_attempt_at null) em vez de deixar o
// proximo increment estourar a constraint.
export function markDeliveryFailed(
    tx: TenantClient,
    id: string,
    attemptCount: number,
    lastError: string,
    nextAttemptAt: Date | null,
) {
    return tx.notification_deliveries.update({
        where: { id },
        data: {
            status: "failed",
            attempt_count: attemptCount,
            last_error: lastError,
            next_attempt_at: nextAttemptAt,
        },
    });
}
