import { z } from "zod";
import * as dto from "@/lib/dto/common";

// Escopo do MVP (issue #39): so os dois tipos com adapter de entrega (#42).
// browser e email ficam fora -- browser tem fluxo proprio via
// browser_push_subscriptions (nao coberto aqui), email nao tem adapter
// ainda.
const commonFields = {
    name: dto.nomeObrigatorio("O nome"),
};

// telegram_chat_id_not_blank
export const createTelegramChannelSchema = z.object({
    channel_type: z.literal("telegram"),
    ...commonFields,
    credential_id: dto.uuid.optional(),
    chat_id: dto.nomeObrigatorio("O chat_id"),
    message_thread_id: z.coerce.number().int().positive().optional(),
});

// URL fica em safe_config (nao ha webhook_channel_configs no schema) --
// nao e sensivel por si so. Um segredo de autenticacao do endpoint (se
// precisar) vai em credential_id, nunca dentro do proprio safe_config.
export const createWebhookChannelSchema = z.object({
    channel_type: z.literal("webhook"),
    ...commonFields,
    url: dto.httpUrl,
    credential_id: dto.uuid.optional(),
});

export const createChannelSchema = z.discriminatedUnion("channel_type", [
    createTelegramChannelSchema,
    createWebhookChannelSchema,
]);

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

// Campos comuns editaveis -- trocar o tipo de canal ou a URL/chat_id e, na
// pratica, criar outro canal (mesmo raciocinio do #30 para monitor_type).
export const updateChannelSchema = z
    .object({
        name: dto.nomeObrigatorio("O nome"),
        enabled: z.boolean(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
