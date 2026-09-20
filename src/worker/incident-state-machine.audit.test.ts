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

const falha: CheckResult = {
    check_status: "failure",
    observed_state: "down",
    response_time_ms: null,
    summary: "falhou",
    details: {},
};

const sucesso: CheckResult = {
    check_status: "success",
    observed_state: "up",
    response_time_ms: 10,
    summary: "ok",
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

describe("auditoria gravada pelo worker (#43)", () => {
    it("abertura de incidente grava audit_log com actor_user_id nulo", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha);

        const log = await adminClient.audit_logs.findFirst({
            where: { organization_id: organization.id, action: "incident.opened" },
        });

        expect(log).not.toBeNull();
        expect(log?.actor_user_id).toBeNull();
        expect(log?.entity_type).toBe("incident");
    });

    it("resolucao de incidente tambem grava audit_log com actor_user_id nulo", async () => {
        const { organization, monitor } = await createFullTenant();

        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, falha);
        await aplicar(organization.id, monitor.id, sucesso);

        const log = await adminClient.audit_logs.findFirst({
            where: { organization_id: organization.id, action: "incident.resolved" },
        });

        expect(log).not.toBeNull();
        expect(log?.actor_user_id).toBeNull();
    });
});
