import type { Prisma } from "@/generated/prisma/client";
import type { TenantClient } from "@/lib/tenant/with-tenant";

export type ChannelType = "telegram" | "webhook";

export type CreateChannelParentData = {
    id: string;
    organizationId: string;
    channelType: ChannelType;
    name: string;
    credentialId?: string;
    safeConfig?: Record<string, unknown>;
};

// Mesmo padrao pai+filho documentado em AGENTS.md (#26) -- FK composta
// (id, organization_id, channel_type) amarra a filha ao tipo certo.
// notification_channels_config_object exige safe_config como objeto JSON.
export function createChannelParent(tx: TenantClient, data: CreateChannelParentData) {
    return tx.notification_channels.create({
        data: {
            id: data.id,
            organization_id: data.organizationId,
            channel_type: data.channelType,
            name: data.name,
            credential_id: data.credentialId,
            safe_config: (data.safeConfig ?? {}) as Prisma.InputJsonValue,
        },
    });
}

export function findChannelById(tx: TenantClient, id: string) {
    return tx.notification_channels.findUnique({ where: { id } });
}

export function listChannels(tx: TenantClient) {
    return tx.notification_channels.findMany({ orderBy: { created_at: "desc" } });
}

export type UpdateChannelParentData = Partial<{ name: string; enabled: boolean }>;

export function updateChannelParent(tx: TenantClient, id: string, data: UpdateChannelParentData) {
    return tx.notification_channels.update({ where: { id }, data });
}

export function deleteChannelParent(tx: TenantClient, id: string) {
    return tx.notification_channels.delete({ where: { id } });
}
