import { applyCheckResult } from "@/worker/incident-state-machine";
import { withWorkerTenant } from "@/worker/with-worker-tenant";
import { createMonitorExecution } from "@/worker/monitor-execution.model";
import { EVENT_CODES } from "@/worker/event.model";
import { workerBasePrisma } from "@/worker/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";
import type { CheckResult } from "@/worker/checks/types";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await workerBasePrisma.$disconnect();
    await adminClient.$disconnect();
});

const sucesso: CheckResult = {
    check_status: "success",
    observed_state: "up",
    response_time_ms: 10,
    summary: "ok",
    details: {},
};
const falha: CheckResult = {
    check_status: "failure",
    observed_state: "down",
    response_time_ms: null,
    summary: "falhou",
    details: {},
};

async function aplicar(organizationId: string, monitorId: string, resultado: CheckResult) {
    return withWorkerTenant(organizationId, async (tx) => {
        const execucao = await createMonitorExecution(tx, {
            organizationId,
            monitorId,
            checkStatus: resultado.check_status,
            observedState: resultado.observed_state,
            startedAt: new Date(),
            finishedAt: new Date(),
            responseTimeMs: resultado.response_time_ms,
            summary: resultado.summary,
            details: resultado.details,
        });

        await applyCheckResult(tx, monitorId, execucao.id, resultado, new Date());
    });
}

describe("eventos emitidos nas transicoes de estado (#38)", () => {
    it("monitor.down e incident.opened emitidos juntos, com severidade critical", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // atinge o threshold

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id },
            orderBy: { happened_at: "asc" },
        });
        const codigos = eventos.map((e) => e.event_code).sort();

        expect(codigos).toEqual([EVENT_CODES.INCIDENT_OPENED, EVENT_CODES.MONITOR_DOWN].sort());
        expect(eventos.every((e) => e.severity === "critical")).toBe(true);
        expect(eventos.find((e) => e.event_code === EVENT_CODES.INCIDENT_OPENED)?.incident_id).not.toBeNull();
    });

    it("falha isolada abaixo do threshold nao emite nenhum evento", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);

        const eventos = await adminClient.events.findMany({ where: { monitor_id: monitor.id } });
        expect(eventos).toHaveLength(0);
    });

    it("monitor.up e incident.resolved emitidos juntos na recuperacao, severidade info", async () => {
        const { organization, monitor } = await createFullTenant();
        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // down

        await aplicar(organization.id, monitor.id, sucesso); // recovery_threshold=1 default

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: { in: [EVENT_CODES.MONITOR_UP, EVENT_CODES.INCIDENT_RESOLVED] } },
        });
        expect(eventos).toHaveLength(2);
        expect(eventos.every((e) => e.severity === "info")).toBe(true);
    });

    it("nao emite monitor.down/incident.opened de novo enquanto o monitor continua down", async () => {
        const { organization, monitor } = await createFullTenant();
        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // abre
        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha);

        const eventos = await adminClient.events.findMany({
            where: { monitor_id: monitor.id, event_code: EVENT_CODES.MONITOR_DOWN },
        });
        expect(eventos).toHaveLength(1);
    });

    it("check com observed_state 'degraded' (sem cruzar threshold de falha) nao emite monitor.down", async () => {
        const { organization, monitor } = await createFullTenant();
        const degradado: CheckResult = { ...sucesso, observed_state: "degraded" };

        await aplicar(organization.id, monitor.id, degradado);

        const eventos = await adminClient.events.findMany({ where: { monitor_id: monitor.id } });
        expect(eventos).toHaveLength(0);
    });
});
