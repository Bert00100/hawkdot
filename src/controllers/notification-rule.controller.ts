import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import {
    createNotificationRule,
    deleteNotificationRule,
    findNotificationRuleById,
    listNotificationRules,
    listRuleChannelIds,
    replaceRuleChannels,
    updateNotificationRule,
} from "@/models/notification-rule.model";
import type {
    CreateNotificationRuleInput,
    UpdateNotificationRuleInput,
} from "@/lib/dto/notification-rule.dto";

// Mesmo padrao de recursos/monitores/canais: escrita exige
// owner/admin/operator, leitura qualquer membro.
const WRITE_ROLES = ["owner", "admin", "operator"] as const;

export type NotificationRuleResult = {
    id: string;
    name: string;
    enabled: boolean;
    monitor_id: string | null;
    event_codes: string[];
    minimum_severity: string;
    cooldown_seconds: number;
    notify_recovery: boolean;
    channel_ids: string[];
};

function shape(
    rule: {
        id: string;
        name: string;
        enabled: boolean;
        monitor_id: string | null;
        event_codes: string[];
        minimum_severity: string;
        cooldown_seconds: number;
        notify_recovery: boolean;
    },
    channelIds: string[],
): NotificationRuleResult {
    return {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        monitor_id: rule.monitor_id,
        event_codes: rule.event_codes,
        minimum_severity: rule.minimum_severity,
        cooldown_seconds: rule.cooldown_seconds,
        notify_recovery: rule.notify_recovery,
        channel_ids: channelIds,
    };
}

export async function createRule(
    tx: TenantClient,
    session: Session,
    input: CreateNotificationRuleInput,
): Promise<NotificationRuleResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const ruleId = randomUUID();

    const rule = await createNotificationRule(tx, {
        id: ruleId,
        organizationId: session.organizationId,
        monitorId: input.monitor_id,
        name: input.name,
        eventCodes: input.event_codes,
        minimumSeverity: input.minimum_severity,
        cooldownSeconds: input.cooldown_seconds,
        notifyRecovery: input.notify_recovery,
    });

    await replaceRuleChannels(tx, ruleId, session.organizationId, input.channel_ids);

    return shape(rule, input.channel_ids);
}

async function loadRule(tx: TenantClient, id: string): Promise<NotificationRuleResult> {
    const rule = await findNotificationRuleById(tx, id);
    if (!rule) {
        throw notFound("Regra de notificacao");
    }

    const channelIds = await listRuleChannelIds(tx, id);
    return shape(rule, channelIds);
}

export async function getRule(tx: TenantClient, id: string): Promise<NotificationRuleResult> {
    return loadRule(tx, id);
}

export async function listRulesController(tx: TenantClient): Promise<NotificationRuleResult[]> {
    const rules = await listNotificationRules(tx);

    return Promise.all(
        rules.map(async (rule) => shape(rule, await listRuleChannelIds(tx, rule.id))),
    );
}

export async function updateRule(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateNotificationRuleInput,
): Promise<NotificationRuleResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findNotificationRuleById(tx, id);
    if (!existing) {
        throw notFound("Regra de notificacao");
    }

    await updateNotificationRule(tx, id, {
        name: input.name,
        enabled: input.enabled,
        eventCodes: input.event_codes,
        minimumSeverity: input.minimum_severity,
        cooldownSeconds: input.cooldown_seconds,
        notifyRecovery: input.notify_recovery,
    });

    if (input.channel_ids) {
        await replaceRuleChannels(tx, id, session.organizationId, input.channel_ids);
    }

    return loadRule(tx, id);
}

export async function deleteRule(tx: TenantClient, session: Session, id: string): Promise<void> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findNotificationRuleById(tx, id);
    if (!existing) {
        throw notFound("Regra de notificacao");
    }

    await deleteNotificationRule(tx, id);
}
