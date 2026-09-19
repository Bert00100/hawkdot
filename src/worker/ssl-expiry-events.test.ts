import { maybeEmitSslExpiring } from "@/worker/ssl-expiry-events";
import { withWorkerTenant } from "@/worker/with-worker-tenant";
import { EVENT_CODES } from "@/worker/event.model";
import { workerBasePrisma } from "@/worker/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await workerBasePrisma.$disconnect();
    await adminClient.$disconnect();
});

const warningDays = [30, 14, 7, 3, 1];

async function emitir(organizationId: string, monitorId: string, daysRemaining: number) {
    await withWorkerTenant(organizationId, async (tx) => {
        // execution_id tem FK real para monitor_executions -- cria uma linha
        // de verdade em vez de forcar um id arbitrario.
        const execucao = await tx.monitor_executions.create({
            data: {
                organization_id: organizationId,
                monitor_id: monitorId,
                check_status: "success",
                observed_state: "up",
                started_at: new Date(),
            },
        });

        await maybeEmitSslExpiring(tx, {
            organizationId,
            monitorId,
            executionId: execucao.id,
            daysRemaining,
            warningDays,
        });
    });
}

describe("maybeEmitSslExpiring -- deduplicacao por faixa de warning_days (#38)", () => {
    it("nao emite nada enquanto fora de qualquer faixa de aviso", async () => {
        const { organization, monitor } = await createFullTenant();

        await emitir(organization.id, monitor.id, 60); // > 30, nenhuma faixa cruzada

        const eventos = await adminClient.events.findMany({ where: { monitor_id: monitor.id } });
        expect(eventos).toHaveLength(0);
    });

    it("emite ao cruzar a primeira faixa (30 dias)", async () => {
        const { organization, monitor } = await createFullTenant();

        await emitir(organization.id, monitor.id, 25);

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: EVENT_CODES.SSL_EXPIRING },
        });
        expect(eventos).toHaveLength(1);
        expect(eventos[0].severity).toBe("warning");
    });

    it("nao reemite enquanto permanece na mesma faixa cruzada", async () => {
        const { organization, monitor } = await createFullTenant();

        await emitir(organization.id, monitor.id, 25); // cruza 30
        await emitir(organization.id, monitor.id, 20); // ainda na faixa 30 (nao cruzou 14)
        await emitir(organization.id, monitor.id, 16); // ainda na faixa 30

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: EVENT_CODES.SSL_EXPIRING },
        });
        expect(eventos).toHaveLength(1);
    });

    it("emite de novo ao cruzar uma faixa mais urgente", async () => {
        const { organization, monitor } = await createFullTenant();

        await emitir(organization.id, monitor.id, 25); // cruza 30
        await emitir(organization.id, monitor.id, 10); // cruza 14

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: EVENT_CODES.SSL_EXPIRING },
            orderBy: { happened_at: "asc" },
        });
        expect(eventos).toHaveLength(2);
        expect((eventos[0].payload as { warning_threshold_days: number }).warning_threshold_days).toBe(30);
        expect((eventos[1].payload as { warning_threshold_days: number }).warning_threshold_days).toBe(14);
    });

    it("certificado ja expirado (dias negativos) emite com severidade critical", async () => {
        const { organization, monitor } = await createFullTenant();

        await emitir(organization.id, monitor.id, -2);

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: EVENT_CODES.SSL_EXPIRING },
        });
        expect(eventos[0].severity).toBe("critical");
    });
});
