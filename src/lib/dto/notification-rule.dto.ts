import { z } from "zod";
import * as dto from "@/lib/dto/common";
import { EVENT_CODES } from "@/worker/event.model";

// event_codes e text[] no banco (aceita qualquer string) -- validar contra
// o vocabulario conhecido aqui e o unico jeito de evitar uma regra que
// nunca dispara por causa de um codigo digitado errado (issue #40).
const EVENT_CODE_VALUES = Object.values(EVENT_CODES) as [string, ...string[]];
const eventCode = z.enum(EVENT_CODE_VALUES);

// notification_rules_events_not_empty
const eventCodes = z.array(eventCode).min(1, "Informe ao menos um evento.");

const severity = z.enum(["info", "warning", "critical"]);

export const createNotificationRuleSchema = z.object({
    name: dto.nomeObrigatorio("O nome"),
    monitor_id: dto.uuid.optional(),
    event_codes: eventCodes,
    minimum_severity: severity.default("warning"),
    // notification_rules_cooldown
    cooldown_seconds: z.coerce.number().int().min(0).default(300),
    notify_recovery: z.boolean().default(true),
    channel_ids: z.array(dto.uuid).default([]),
});

export type CreateNotificationRuleInput = z.infer<typeof createNotificationRuleSchema>;

export const updateNotificationRuleSchema = z
    .object({
        name: dto.nomeObrigatorio("O nome"),
        enabled: z.boolean(),
        event_codes: eventCodes,
        minimum_severity: severity,
        cooldown_seconds: z.coerce.number().int().min(0),
        notify_recovery: z.boolean(),
        channel_ids: z.array(dto.uuid),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type UpdateNotificationRuleInput = z.infer<typeof updateNotificationRuleSchema>;
