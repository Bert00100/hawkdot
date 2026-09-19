import {
    createRule,
    deleteRule,
    getRule,
    listRulesController,
    updateRule,
} from "@/controllers/notification-rule.controller";
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

async function createTelegramChannel(organizationId: string, name = "Canal Teste") {
    return adminClient.notification_channels.create({
        data: { organization_id: organizationId, channel_type: "telegram", name },
    });
}

describe("createRule / getRule / listRules / updateRule / deleteRule", () => {
    it("cria uma regra geral (sem monitor_id) com canais vinculados", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const canal = await createTelegramChannel(organization.id);

        const criada = await withTenant(session, (tx) =>
            createRule(tx, session, {
                name: "Alertas criticos",
                event_codes: ["monitor.down", "incident.opened"],
                minimum_severity: "warning",
                cooldown_seconds: 300,
                notify_recovery: true,
                channel_ids: [canal.id],
            }),
        );

        expect(criada).toMatchObject({
            name: "Alertas criticos",
            event_codes: ["monitor.down", "incident.opened"],
            channel_ids: [canal.id],
            monitor_id: null,
        });
    });

    it("cria uma regra especifica de um monitor", async () => {
        const { user, organization, monitor } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criada = await withTenant(session, (tx) =>
            createRule(tx, session, {
                name: "Regra do monitor",
                monitor_id: monitor.id,
                event_codes: ["ssl.expiring"],
                minimum_severity: "warning",
                cooldown_seconds: 0,
                notify_recovery: true,
                channel_ids: [],
            }),
        );

        expect(criada.monitor_id).toBe(monitor.id);
    });

    it("event_codes fora do vocabulario conhecido e recusado (validacao no DTO)", async () => {
        const { createNotificationRuleSchema } = await import("@/lib/dto/notification-rule.dto");

        const resultado = createNotificationRuleSchema.safeParse({
            name: "Regra invalida",
            event_codes: ["evento.que.nao.existe"],
        });

        expect(resultado.success).toBe(false);
    });

    it("array vazio de event_codes e recusado (400, via DTO)", async () => {
        const { createNotificationRuleSchema } = await import("@/lib/dto/notification-rule.dto");

        const resultado = createNotificationRuleSchema.safeParse({
            name: "Regra sem eventos",
            event_codes: [],
        });

        expect(resultado.success).toBe(false);
    });

    it.each(["operator", "viewer"] as const)(
        "%s: operator consegue, viewer nao consegue criar regra",
        async (role) => {
            const { organization } = await createFullTenant();
            const membro = await createUser();
            await createMember(organization.id, membro.id, { role });
            const session = { userId: membro.id, organizationId: organization.id };

            const resultado = await withTenant(session, (tx) =>
                createRule(tx, session, {
                    name: `Regra de ${role}`,
                    event_codes: ["monitor.down"],
                    minimum_severity: "warning",
                    cooldown_seconds: 300,
                    notify_recovery: true,
                    channel_ids: [],
                }),
            ).catch((e) => e);

            if (role === "operator") {
                expect(resultado).toMatchObject({ name: `Regra de ${role}` });
            } else {
                expect(errorResponse(resultado).status).toBe(403);
            }
        },
    );

    it("lista, busca, atualiza (incluindo troca de canais) e remove uma regra", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const canalA = await createTelegramChannel(organization.id, "Canal A");
        const canalB = await createTelegramChannel(organization.id, "Canal B");

        const criada = await withTenant(session, (tx) =>
            createRule(tx, session, {
                name: "Regra original",
                event_codes: ["monitor.down"],
                minimum_severity: "warning",
                cooldown_seconds: 300,
                notify_recovery: true,
                channel_ids: [canalA.id],
            }),
        );

        const lista = await withTenant(session, (tx) => listRulesController(tx));
        expect(lista.map((r) => r.id)).toContain(criada.id);

        const buscada = await withTenant(session, (tx) => getRule(tx, criada.id));
        expect(buscada.channel_ids).toEqual([canalA.id]);

        const atualizada = await withTenant(session, (tx) =>
            updateRule(tx, session, criada.id, {
                name: "Regra renomeada",
                enabled: false,
                channel_ids: [canalB.id],
            }),
        );
        expect(atualizada).toMatchObject({ name: "Regra renomeada", enabled: false });
        expect(atualizada.channel_ids).toEqual([canalB.id]);

        await withTenant(session, (tx) => deleteRule(tx, session, criada.id));

        const depois = await adminClient.notification_rules.findUnique({ where: { id: criada.id } });
        expect(depois).toBeNull();
    });

    it("nome duplicado na mesma organizacao retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        await withTenant(session, (tx) =>
            createRule(tx, session, {
                name: "Repetido",
                event_codes: ["monitor.down"],
                minimum_severity: "warning",
                cooldown_seconds: 300,
                notify_recovery: true,
                channel_ids: [],
            }),
        );

        const erro = await withTenant(session, (tx) =>
            createRule(tx, session, {
                name: "Repetido",
                event_codes: ["monitor.up"],
                minimum_severity: "warning",
                cooldown_seconds: 300,
                notify_recovery: true,
                channel_ids: [],
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("buscar regra inexistente retorna 404", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            getRule(tx, "11111111-1111-4111-8111-111111111111"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});
