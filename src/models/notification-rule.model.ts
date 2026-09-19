import type { TenantClient } from "@/lib/tenant/with-tenant";

export type CreateNotificationRuleData = {
    id: string;
    organizationId: string;
    monitorId?: string;
    name: string;
    eventCodes: string[];
    minimumSeverity: string;
    cooldownSeconds: number;
    notifyRecovery: boolean;
};

export function createNotificationRule(tx: TenantClient, data: CreateNotificationRuleData) {
    return tx.notification_rules.create({
        data: {
            id: data.id,
            organization_id: data.organizationId,
            monitor_id: data.monitorId,
            name: data.name,
            event_codes: data.eventCodes,
            minimum_severity: data.minimumSeverity as never,
            cooldown_seconds: data.cooldownSeconds,
            notify_recovery: data.notifyRecovery,
        },
    });
}

export function findNotificationRuleById(tx: TenantClient, id: string) {
    return tx.notification_rules.findUnique({ where: { id } });
}

export function listNotificationRules(tx: TenantClient) {
    return tx.notification_rules.findMany({ orderBy: { created_at: "desc" } });
}

export type UpdateNotificationRuleData = Partial<{
    name: string;
    enabled: boolean;
    eventCodes: string[];
    minimumSeverity: string;
    cooldownSeconds: number;
    notifyRecovery: boolean;
}>;

export function updateNotificationRule(tx: TenantClient, id: string, data: UpdateNotificationRuleData) {
    return tx.notification_rules.update({
        where: { id },
        data: {
            name: data.name,
            enabled: data.enabled,
            event_codes: data.eventCodes,
            minimum_severity: data.minimumSeverity as never,
            cooldown_seconds: data.cooldownSeconds,
            notify_recovery: data.notifyRecovery,
        },
    });
}

export function deleteNotificationRule(tx: TenantClient, id: string) {
    return tx.notification_rules.delete({ where: { id } });
}

// notification_rule_channels: vinculo N:N. Substituir tudo de uma vez
// (delete + create) e mais simples e menos propenso a erro do que um diff
// de conjuntos, e o volume por regra e pequeno (poucos canais).
export async function replaceRuleChannels(
    tx: TenantClient,
    ruleId: string,
    organizationId: string,
    channelIds: string[],
) {
    await tx.notification_rule_channels.deleteMany({ where: { rule_id: ruleId } });

    if (channelIds.length === 0) {
        return;
    }

    await tx.notification_rule_channels.createMany({
        data: channelIds.map((channelId) => ({
            rule_id: ruleId,
            channel_id: channelId,
            organization_id: organizationId,
        })),
    });
}

export function listRuleChannelIds(tx: TenantClient, ruleId: string) {
    return tx.notification_rule_channels
        .findMany({ where: { rule_id: ruleId }, select: { channel_id: true } })
        .then((rows) => rows.map((row) => row.channel_id));
}
