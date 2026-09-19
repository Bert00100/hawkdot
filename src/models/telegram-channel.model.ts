import type { TenantClient } from "@/lib/tenant/with-tenant";

export type TelegramChannelConfig = {
    chat_id: string;
    message_thread_id: number | null;
};

function shape(config: { chat_id: string; message_thread_id: bigint | null }): TelegramChannelConfig {
    return {
        chat_id: config.chat_id,
        message_thread_id: config.message_thread_id === null ? null : Number(config.message_thread_id),
    };
}

export async function createTelegramChannelConfig(
    tx: TenantClient,
    params: {
        channelId: string;
        organizationId: string;
        chatId: string;
        messageThreadId?: number;
    },
): Promise<TelegramChannelConfig> {
    const config = await tx.telegram_channel_configs.create({
        data: {
            channel_id: params.channelId,
            organization_id: params.organizationId,
            chat_id: params.chatId,
            message_thread_id: params.messageThreadId,
        },
    });

    return shape(config);
}

export async function findTelegramChannelConfig(
    tx: TenantClient,
    channelId: string,
): Promise<TelegramChannelConfig | null> {
    const config = await tx.telegram_channel_configs.findUnique({ where: { channel_id: channelId } });
    return config ? shape(config) : null;
}
