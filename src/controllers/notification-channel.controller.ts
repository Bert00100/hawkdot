import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import {
    createChannelParent,
    deleteChannelParent,
    findChannelById,
    listChannels,
    updateChannelParent,
} from "@/models/notification-channel.model";
import {
    createTelegramChannelConfig,
    findTelegramChannelConfig,
} from "@/models/telegram-channel.model";
import type { CreateChannelInput, UpdateChannelInput } from "@/lib/dto/channel.dto";

// Escrita exige owner/admin/operator (tenant_app_insert/update/delete),
// mesmo padrao dos recursos (#26) e monitores (#30).
const WRITE_ROLES = ["owner", "admin", "operator"] as const;

export type ChannelResult = {
    id: string;
    channel_type: string;
    name: string;
    enabled: boolean;
    config: unknown;
};

function shapeTelegram(
    channel: { id: string; channel_type: string; name: string; enabled: boolean },
    config: { chat_id: string; message_thread_id: number | null },
): ChannelResult {
    return {
        id: channel.id,
        channel_type: channel.channel_type,
        name: channel.name,
        enabled: channel.enabled,
        config: { chat_id: config.chat_id, message_thread_id: config.message_thread_id },
    };
}

function shapeWebhook(channel: {
    id: string;
    channel_type: string;
    name: string;
    enabled: boolean;
    safe_config: unknown;
}): ChannelResult {
    return {
        id: channel.id,
        channel_type: channel.channel_type,
        name: channel.name,
        enabled: channel.enabled,
        config: channel.safe_config,
    };
}

export async function createChannel(
    tx: TenantClient,
    session: Session,
    input: CreateChannelInput,
): Promise<ChannelResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const channelId = randomUUID();

    if (input.channel_type === "telegram") {
        const channel = await createChannelParent(tx, {
            id: channelId,
            organizationId: session.organizationId,
            channelType: "telegram",
            name: input.name,
            credentialId: input.credential_id,
        });
        const config = await createTelegramChannelConfig(tx, {
            channelId,
            organizationId: session.organizationId,
            chatId: input.chat_id,
            messageThreadId: input.message_thread_id,
        });

        return shapeTelegram(channel, config);
    }

    const channel = await createChannelParent(tx, {
        id: channelId,
        organizationId: session.organizationId,
        channelType: "webhook",
        name: input.name,
        credentialId: input.credential_id,
        safeConfig: { url: input.url },
    });

    return shapeWebhook(channel);
}

async function loadChannel(tx: TenantClient, id: string): Promise<ChannelResult> {
    const channel = await findChannelById(tx, id);
    if (!channel) {
        throw notFound("Canal de notificacao");
    }

    if (channel.channel_type === "telegram") {
        const config = await findTelegramChannelConfig(tx, id);
        if (!config) {
            throw notFound("Canal de notificacao");
        }
        return shapeTelegram(channel, config);
    }

    return shapeWebhook(channel);
}

export async function getChannel(tx: TenantClient, id: string): Promise<ChannelResult> {
    return loadChannel(tx, id);
}

export async function listChannelsController(tx: TenantClient): Promise<ChannelResult[]> {
    const channels = await listChannels(tx);

    return Promise.all(
        channels.map(async (channel) => {
            if (channel.channel_type === "telegram") {
                const config = await findTelegramChannelConfig(tx, channel.id);
                return config ? shapeTelegram(channel, config) : shapeWebhook(channel);
            }
            return shapeWebhook(channel);
        }),
    );
}

export async function updateChannel(
    tx: TenantClient,
    session: Session,
    id: string,
    input: UpdateChannelInput,
): Promise<ChannelResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findChannelById(tx, id);
    if (!existing) {
        throw notFound("Canal de notificacao");
    }

    await updateChannelParent(tx, id, { name: input.name, enabled: input.enabled });

    return loadChannel(tx, id);
}

export async function deleteChannel(tx: TenantClient, session: Session, id: string): Promise<void> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findChannelById(tx, id);
    if (!existing) {
        throw notFound("Canal de notificacao");
    }

    await deleteChannelParent(tx, id);
}
