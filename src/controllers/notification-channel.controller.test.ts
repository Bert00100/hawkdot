import {
    createChannel,
    deleteChannel,
    getChannel,
    listChannelsController,
    updateChannel,
} from "@/controllers/notification-channel.controller";
import { createCredentialController } from "@/controllers/credential.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await adminClient.$disconnect();
});

describe("createChannel / getChannel / listChannels / updateChannel / deleteChannel", () => {
    it("cria um canal telegram com config de chat_id", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "telegram",
                name: "Time de Infra",
                chat_id: "-100123456",
            }),
        );

        expect(criado).toMatchObject({
            channel_type: "telegram",
            name: "Time de Infra",
            enabled: true,
            config: { chat_id: "-100123456", message_thread_id: null },
        });
    });

    it("cria um canal webhook com url em safe_config", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "webhook",
                name: "Webhook do time",
                url: "https://example.com/hook",
            }),
        );

        expect(criado).toMatchObject({
            channel_type: "webhook",
            name: "Webhook do time",
            config: { url: "https://example.com/hook" },
        });
    });

    it("o segredo da credencial referenciada nunca aparece na resposta do canal", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const credencial = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Bot do Telegram",
                credential_type: "api_token",
                secret: "token-secreto-do-bot",
            }),
        );

        const criado = await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "telegram",
                name: "Canal com credencial",
                credential_id: credencial.id,
                chat_id: "123",
            }),
        );

        expect(JSON.stringify(criado)).not.toContain("token-secreto-do-bot");
        expect(JSON.stringify(criado)).not.toContain("secret");
    });

    it.each(["operator", "viewer"] as const)(
        "%s: operator consegue, viewer nao consegue criar canal",
        async (role) => {
            const { organization } = await createFullTenant();
            const membro = await createUser();
            await createMember(organization.id, membro.id, { role });
            const session = { userId: membro.id, organizationId: organization.id };

            const resultado = await withTenant(session, (tx) =>
                createChannel(tx, session, {
                    channel_type: "telegram",
                    name: `Canal de ${role}`,
                    chat_id: "1",
                }),
            ).catch((e) => e);

            if (role === "operator") {
                expect(resultado).toMatchObject({ channel_type: "telegram" });
            } else {
                expect(errorResponse(resultado).status).toBe(403);
            }
        },
    );

    it("lista, busca, atualiza e remove um canal", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "telegram",
                name: "Canal original",
                chat_id: "42",
            }),
        );

        const lista = await withTenant(session, (tx) => listChannelsController(tx));
        expect(lista.map((c) => c.id)).toContain(criado.id);

        const buscado = await withTenant(session, (tx) => getChannel(tx, criado.id));
        expect(buscado).toMatchObject({ name: "Canal original" });

        const atualizado = await withTenant(session, (tx) =>
            updateChannel(tx, session, criado.id, { name: "Canal renomeado", enabled: false }),
        );
        expect(atualizado).toMatchObject({ name: "Canal renomeado", enabled: false });

        await withTenant(session, (tx) => deleteChannel(tx, session, criado.id));

        const depois = await adminClient.notification_channels.findUnique({ where: { id: criado.id } });
        expect(depois).toBeNull();
    });

    it("nome duplicado na mesma organizacao retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "telegram",
                name: "Repetido",
                chat_id: "1",
            }),
        );

        const erro = await withTenant(session, (tx) =>
            createChannel(tx, session, {
                channel_type: "telegram",
                name: "Repetido",
                chat_id: "2",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("buscar canal inexistente retorna 404", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            getChannel(tx, "11111111-1111-4111-8111-111111111111"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});
