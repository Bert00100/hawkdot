import { createMonitorExecution } from "@/worker/monitor-execution.model";
import { withWorkerTenant } from "@/worker/with-worker-tenant";
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

describe("createMonitorExecution", () => {
    it("grava todos os campos relevantes e calcula duration_ms", async () => {
        const { organization, monitor } = await createFullTenant();
        const startedAt = new Date(Date.now() - 250);
        const finishedAt = new Date();

        const execucao = await withWorkerTenant(organization.id, (tx) =>
            createMonitorExecution(tx, {
                organizationId: organization.id,
                monitorId: monitor.id,
                checkStatus: "success",
                observedState: "up",
                startedAt,
                finishedAt,
                responseTimeMs: 42,
                summary: "HTTP 200",
                details: { status: 200 },
            }),
        );

        expect(execucao.check_status).toBe("success");
        expect(execucao.observed_state).toBe("up");
        expect(execucao.response_time_ms).toBe(42);
        expect(execucao.details).toEqual({ status: 200 });
        expect(execucao.duration_ms).toBeGreaterThanOrEqual(200);
    });

    it("respeita monitor_execution_time_order (finished_at >= started_at) -- nunca inverte na pratica", async () => {
        const { organization, monitor } = await createFullTenant();
        const agora = new Date();

        const execucao = await withWorkerTenant(organization.id, (tx) =>
            createMonitorExecution(tx, {
                organizationId: organization.id,
                monitorId: monitor.id,
                checkStatus: "success",
                observedState: "up",
                startedAt: agora,
                finishedAt: agora,
                responseTimeMs: 0,
                summary: "instantaneo",
                details: {},
            }),
        );

        expect(execucao.duration_ms).toBe(0);
    });
});
