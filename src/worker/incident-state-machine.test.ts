import { applyCheckResult } from "@/worker/incident-state-machine";
import { withWorkerTenant } from "@/worker/with-worker-tenant";
import { createMonitorExecution } from "@/worker/monitor-execution.model";
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

// Roda applyCheckResult dentro de withWorkerTenant, gravando uma
// monitor_executions de verdade antes (para respeitar a FK opened_by_execution_id).
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

describe("applyCheckResult -- maquina de estado de incidentes (#37)", () => {
    it("falha isolada abaixo do threshold nao abre incidente", async () => {
        const { organization, monitor } = await createFullTenant();
        // factory ja cria com failure_threshold default = 2

        await aplicar(organization.id, monitor.id, falha);

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).not.toBe("down");
        expect(atualizado?.consecutive_failures).toBe(1);

        const incidentes = await adminClient.incidents.findMany({ where: { monitor_id: monitor.id } });
        expect(incidentes).toHaveLength(0);
    });

    it("falhas consecutivas atingindo o threshold abrem exatamente um incidente", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // atinge failure_threshold=2

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).toBe("down");
        expect(atualizado?.consecutive_failures).toBe(0); // zerado na transicao

        const incidentes = await adminClient.incidents.findMany({ where: { monitor_id: monitor.id } });
        expect(incidentes).toHaveLength(1);
        expect(incidentes[0].status).toBe("open");
    });

    it("nunca existe mais de um incidente ativo por monitor (indice unico parcial respeitado)", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // abre incidente
        await aplicar(organization.id, monitor.id, falha); // continua down, nao abre outro
        await aplicar(organization.id, monitor.id, falha);

        const incidentesAtivos = await adminClient.incidents.findMany({
            where: { monitor_id: monitor.id, status: { in: ["open", "acknowledged"] } },
        });
        expect(incidentesAtivos).toHaveLength(1);
    });

    it("recuperacao resolve o incidente e preenche resolved_at", async () => {
        const { organization, monitor } = await createFullTenant();
        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // down, incidente aberto

        await aplicar(organization.id, monitor.id, sucesso); // recovery_threshold=1 (default)

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).toBe("up");
        expect(atualizado?.consecutive_successes).toBe(0);

        const incidente = await adminClient.incidents.findFirst({ where: { monitor_id: monitor.id } });
        expect(incidente?.status).toBe("resolved");
        expect(incidente?.resolved_at).not.toBeNull();
    });

    it("sucesso isolado durante down, abaixo do recovery_threshold, nao resolve", async () => {
        const { organization, monitor } = await createFullTenant();
        await adminClient.monitors.update({ where: { id: monitor.id }, data: { recovery_threshold: 3 } });

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha); // down
        await aplicar(organization.id, monitor.id, sucesso); // so 1 de 3

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).toBe("down");

        const incidente = await adminClient.incidents.findFirst({ where: { monitor_id: monitor.id } });
        expect(incidente?.status).toBe("open");
    });

    it("contadores zerados corretamente nas transicoes (falha depois de sucesso, e vice versa)", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        let atual = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atual?.consecutive_failures).toBe(1);
        expect(atual?.consecutive_successes).toBe(0);

        await aplicar(organization.id, monitor.id, sucesso);
        atual = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atual?.consecutive_failures).toBe(0);
        expect(atual?.consecutive_successes).toBe(1);
    });

    it("check success com observed_state 'degraded' NAO conta como falha (nao abre incidente)", async () => {
        const { organization, monitor } = await createFullTenant();
        const degradado: CheckResult = { ...sucesso, observed_state: "degraded" };

        await aplicar(organization.id, monitor.id, degradado);
        await aplicar(organization.id, monitor.id, degradado);
        await aplicar(organization.id, monitor.id, degradado);

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).toBe("degraded");
        expect(atualizado?.consecutive_failures).toBe(0);

        const incidentes = await adminClient.incidents.findMany({ where: { monitor_id: monitor.id } });
        expect(incidentes).toHaveLength(0);
    });

    it("primeiro check (estado 'unknown') vira 'up' direto, sem exigir threshold", async () => {
        const { organization, monitor } = await createFullTenant();
        const inicial = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(inicial?.current_state).toBe("unknown");

        await aplicar(organization.id, monitor.id, sucesso);

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.current_state).toBe("up");
    });
});
