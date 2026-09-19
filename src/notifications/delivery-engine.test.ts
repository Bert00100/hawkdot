import { processPendingEvents } from "@/notifications/delivery-engine";
import { withTenant } from "@/lib/tenant/with-tenant";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await adminClient.$disconnect();
});

async function createChannel(organizationId: string, overrides: { enabled?: boolean } = {}) {
    return adminClient.notification_channels.create({
        data: {
            organization_id: organizationId,
            channel_type: "telegram",
            name: `Canal ${Math.random()}`,
            enabled: overrides.enabled ?? true,
        },
    });
}

async function createRule(
    organizationId: string,
    channelId: string,
    overrides: {
        monitor_id?: string;
        event_codes?: string[];
        minimum_severity?: "info" | "warning" | "critical";
        cooldown_seconds?: number;
        notify_recovery?: boolean;
    } = {},
) {
    const rule = await adminClient.notification_rules.create({
        data: {
            organization_id: organizationId,
            monitor_id: overrides.monitor_id,
            name: `Regra ${Math.random()}`,
            event_codes: overrides.event_codes ?? ["monitor.down"],
            minimum_severity: overrides.minimum_severity ?? "warning",
            cooldown_seconds: overrides.cooldown_seconds ?? 300,
            notify_recovery: overrides.notify_recovery ?? true,
        },
    });

    await adminClient.notification_rule_channels.create({
        data: { organization_id: organizationId, rule_id: rule.id, channel_id: channelId },
    });

    return rule;
}

async function createEventRow(
    organizationId: string,
    overrides: {
        monitor_id?: string;
        event_code?: string;
        severity?: "info" | "warning" | "critical";
    } = {},
) {
    return adminClient.events.create({
        data: {
            organization_id: organizationId,
            monitor_id: overrides.monitor_id,
            event_code: overrides.event_code ?? "monitor.down",
            severity: overrides.severity ?? "critical",
            message: "teste",
        },
    });
}

describe("processPendingEvents", () => {
    it("evento que casa com uma regra gera entrega pending no canal vinculado", async () => {
        const { user, organization } = await createFullTenant();
        const canal = await createChannel(organization.id);
        await createRule(organization.id, canal.id);
        const evento = await createEventRow(organization.id);

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(1);
        expect(entregas[0]).toMatchObject({ status: "pending", channel_id: canal.id });
    });

    it("evento sem regra correspondente nao gera nenhuma entrega", async () => {
        const { user, organization } = await createFullTenant();
        const evento = await createEventRow(organization.id, { event_code: "ssl.expiring" });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(0);
    });

    it("canal desabilitado nao recebe entrega", async () => {
        const { user, organization } = await createFullTenant();
        const canal = await createChannel(organization.id, { enabled: false });
        await createRule(organization.id, canal.id);
        const evento = await createEventRow(organization.id);

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(0);
    });

    it("severidade do evento abaixo do minimo da regra nao gera entrega", async () => {
        const { user, organization } = await createFullTenant();
        const canal = await createChannel(organization.id);
        await createRule(organization.id, canal.id, { minimum_severity: "critical" });
        const evento = await createEventRow(organization.id, { severity: "warning" });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(0);
    });

    it("evento de recuperacao so gera entrega quando notify_recovery e true", async () => {
        const { user, organization } = await createFullTenant();
        const canal = await createChannel(organization.id);
        await createRule(organization.id, canal.id, {
            event_codes: ["monitor.up"],
            notify_recovery: false,
        });
        const evento = await createEventRow(organization.id, {
            event_code: "monitor.up",
            severity: "info",
        });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(0);
    });

    it("dentro do cooldown: novo evento gera entrega skipped, nao pending", async () => {
        const { user, organization, monitor } = await createFullTenant();
        const canal = await createChannel(organization.id);
        const regra = await createRule(organization.id, canal.id, {
            monitor_id: monitor.id,
            cooldown_seconds: 600,
        });

        const eventoAnterior = await createEventRow(organization.id, { monitor_id: monitor.id });
        await adminClient.notification_deliveries.create({
            data: {
                organization_id: organization.id,
                event_id: eventoAnterior.id,
                rule_id: regra.id,
                channel_id: canal.id,
                status: "sent",
                sent_at: new Date(),
            },
        });

        const eventoNovo = await createEventRow(organization.id, { monitor_id: monitor.id });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: eventoNovo.id },
        });
        expect(entregas).toHaveLength(1);
        expect(entregas[0].status).toBe("skipped");
    });

    it("fora do cooldown: novo evento gera entrega pending normalmente", async () => {
        const { user, organization, monitor } = await createFullTenant();
        // notification_cooldown_seconds do monitor tem default 300 --
        // zera aqui para o cooldown efetivo ser so o da regra (1s).
        await adminClient.monitors.update({
            where: { id: monitor.id },
            data: { notification_cooldown_seconds: 1 },
        });
        const canal = await createChannel(organization.id);
        const regra = await createRule(organization.id, canal.id, {
            monitor_id: monitor.id,
            cooldown_seconds: 1,
        });

        const eventoAnterior = await createEventRow(organization.id, { monitor_id: monitor.id });
        const sentAt = new Date(Date.now() - 5_000);
        await adminClient.notification_deliveries.create({
            data: {
                organization_id: organization.id,
                event_id: eventoAnterior.id,
                rule_id: regra.id,
                channel_id: canal.id,
                status: "sent",
                sent_at: sentAt,
            },
        });

        const eventoNovo = await createEventRow(organization.id, { monitor_id: monitor.id });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: eventoNovo.id },
        });
        expect(entregas).toHaveLength(1);
        expect(entregas[0].status).toBe("pending");
    });

    it("reprocessar nao duplica entregas (idempotencia via evento ja processado)", async () => {
        const { user, organization } = await createFullTenant();
        const canal = await createChannel(organization.id);
        await createRule(organization.id, canal.id);
        const evento = await createEventRow(organization.id);

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );
        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: evento.id },
        });
        expect(entregas).toHaveLength(1);
    });

    it("cooldown do monitor prevalece quando maior que o da regra", async () => {
        const { user, organization, monitor } = await createFullTenant();
        await adminClient.monitors.update({
            where: { id: monitor.id },
            data: { notification_cooldown_seconds: 3600 },
        });
        const canal = await createChannel(organization.id);
        const regra = await createRule(organization.id, canal.id, {
            monitor_id: monitor.id,
            cooldown_seconds: 1,
        });

        const eventoAnterior = await createEventRow(organization.id, { monitor_id: monitor.id });
        await adminClient.notification_deliveries.create({
            data: {
                organization_id: organization.id,
                event_id: eventoAnterior.id,
                rule_id: regra.id,
                channel_id: canal.id,
                status: "sent",
                sent_at: new Date(Date.now() - 5_000),
            },
        });

        const eventoNovo = await createEventRow(organization.id, { monitor_id: monitor.id });

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            processPendingEvents(tx, organization.id),
        );

        const entregas = await adminClient.notification_deliveries.findMany({
            where: { event_id: eventoNovo.id },
        });
        expect(entregas[0].status).toBe("skipped");
    });
});
