import { dispatchPendingDeliveries } from "@/notifications/dispatch-pending";
import { withTenant } from "@/lib/tenant/with-tenant";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";
import { encryptSecret, ENCRYPTION_KEY_ID } from "@/lib/crypto/credential-encryption";
import { randomUUID } from "node:crypto";

beforeEach(async () => {
    await cleanDatabase();
});

afterEach(() => {
    jest.restoreAllMocks();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await adminClient.$disconnect();
});

async function createCredentialWithSecret(organizationId: string, secret: string) {
    return adminClient.credentials.create({
        data: {
            organization_id: organizationId,
            name: `Credencial ${Math.random()}`,
            credential_type: "api_token",
            encrypted_secret: Uint8Array.from(encryptSecret(secret)),
            encryption_key_id: ENCRYPTION_KEY_ID,
        },
    });
}

async function createTelegramChannel(organizationId: string, credentialId?: string) {
    const channel = await adminClient.notification_channels.create({
        data: {
            organization_id: organizationId,
            channel_type: "telegram",
            name: `Canal ${Math.random()}`,
            credential_id: credentialId,
        },
    });
    await adminClient.telegram_channel_configs.create({
        data: { channel_id: channel.id, organization_id: organizationId, chat_id: "123" },
    });
    return channel;
}

async function createWebhookChannel(organizationId: string, url: string) {
    return adminClient.notification_channels.create({
        data: {
            organization_id: organizationId,
            channel_type: "webhook",
            name: `Canal ${Math.random()}`,
            safe_config: { url },
        },
    });
}

async function createPendingDelivery(
    organizationId: string,
    channelId: string,
    overrides: { attempt_count?: number; status?: "pending" | "failed" } = {},
) {
    const event = await adminClient.events.create({
        data: {
            organization_id: organizationId,
            event_code: "monitor.down",
            severity: "critical",
            message: "teste",
        },
    });

    return adminClient.notification_deliveries.create({
        data: {
            id: randomUUID(),
            organization_id: organizationId,
            event_id: event.id,
            channel_id: channelId,
            status: overrides.status ?? "pending",
            attempt_count: overrides.attempt_count ?? 0,
        },
    });
}

describe("dispatchPendingDeliveries", () => {
    it("envia com sucesso e marca a entrega como sent com sent_at preenchido", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }),
        );

        const { user, organization } = await createFullTenant();
        const credencial = await createCredentialWithSecret(organization.id, "token-do-bot");
        const canal = await createTelegramChannel(organization.id, credencial.id);
        const entrega = await createPendingDelivery(organization.id, canal.id);

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            dispatchPendingDeliveries(tx, organization.id),
        );

        expect(resultado).toEqual({ sent: 1, failed: 0 });

        const depois = await adminClient.notification_deliveries.findUnique({ where: { id: entrega.id } });
        expect(depois?.status).toBe("sent");
        expect(depois?.sent_at).not.toBeNull();
        expect(depois?.provider_message_id).toBe("1");
    });

    it("falha: incrementa attempt_count, define next_attempt_at e nunca vaza o segredo em last_error", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ok: false, description: "erro token-do-bot invalido" }), {
                status: 400,
            }),
        );

        const { user, organization } = await createFullTenant();
        const credencial = await createCredentialWithSecret(organization.id, "token-do-bot");
        const canal = await createTelegramChannel(organization.id, credencial.id);
        const entrega = await createPendingDelivery(organization.id, canal.id);

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            dispatchPendingDeliveries(tx, organization.id),
        );

        const depois = await adminClient.notification_deliveries.findUnique({ where: { id: entrega.id } });
        expect(depois?.status).toBe("failed");
        expect(depois?.attempt_count).toBe(1);
        expect(depois?.next_attempt_at).not.toBeNull();
        expect(depois?.sent_at).toBeNull();
        expect(depois?.last_error).not.toContain("token-do-bot");
    });

    it("attempt_count nunca ultrapassa 20: na tentativa 20 o retry para (next_attempt_at nulo)", async () => {
        jest.spyOn(global, "fetch").mockRejectedValue(new Error("timeout"));

        const { user, organization } = await createFullTenant();
        const credencial = await createCredentialWithSecret(organization.id, "token-do-bot");
        const canal = await createTelegramChannel(organization.id, credencial.id);
        const entrega = await createPendingDelivery(organization.id, canal.id, {
            attempt_count: 19,
            status: "failed",
        });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            dispatchPendingDeliveries(tx, organization.id),
        );

        const depois = await adminClient.notification_deliveries.findUnique({ where: { id: entrega.id } });
        expect(depois?.attempt_count).toBe(20);
        expect(depois?.next_attempt_at).toBeNull();
    });

    it("entrega com attempt_count ja em 20 nao e reprocessada", async () => {
        jest.spyOn(global, "fetch").mockRejectedValue(new Error("nao deveria ser chamado"));

        const { user, organization } = await createFullTenant();
        const credencial = await createCredentialWithSecret(organization.id, "token-do-bot");
        const canal = await createTelegramChannel(organization.id, credencial.id);
        await createPendingDelivery(organization.id, canal.id, { attempt_count: 20, status: "failed" });

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            dispatchPendingDeliveries(tx, organization.id),
        );

        expect(resultado).toEqual({ sent: 0, failed: 0 });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("falha em um canal nao impede a entrega nos outros", async () => {
        jest.spyOn(global, "fetch").mockImplementation((input) => {
            const url = input.toString();
            if (url.includes("api.telegram.org")) {
                return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 }));
            }
            return Promise.resolve(new Response(null, { status: 204 }));
        });

        const { user, organization } = await createFullTenant();
        const credencial = await createCredentialWithSecret(organization.id, "token-do-bot");
        const canalTelegram = await createTelegramChannel(organization.id, credencial.id);
        const canalWebhook = await createWebhookChannel(organization.id, "https://example.com/hook");

        const entregaTelegram = await createPendingDelivery(organization.id, canalTelegram.id);
        const entregaWebhook = await createPendingDelivery(organization.id, canalWebhook.id);

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            dispatchPendingDeliveries(tx, organization.id),
        );

        expect(resultado).toEqual({ sent: 1, failed: 1 });

        const telegramDepois = await adminClient.notification_deliveries.findUnique({
            where: { id: entregaTelegram.id },
        });
        const webhookDepois = await adminClient.notification_deliveries.findUnique({
            where: { id: entregaWebhook.id },
        });
        expect(telegramDepois?.status).toBe("failed");
        expect(webhookDepois?.status).toBe("sent");
    });
});
