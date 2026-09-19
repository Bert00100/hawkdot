import * as http from "node:http";
import { executeMonitor } from "@/worker/execute-monitor";
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

function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as { port: number };
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

describe("executeMonitor", () => {
    it("roda o check, grava a execucao e atualiza last_check_at", async () => {
        const { organization, resource } = await createFullTenant();
        const server = await startServer((_req, res) => res.writeHead(200).end("ok"));
        const monitor = await adminClient.monitors.create({
            data: {
                organization_id: organization.id,
                resource_id: resource.id,
                monitor_type: "http",
                name: "Monitor executavel",
                interval_seconds: 60,
                timeout_seconds: 5,
                next_check_at: new Date(),
            },
        });
        await adminClient.http_monitor_configs.create({
            data: { monitor_id: monitor.id, organization_id: organization.id, url: server.url },
        });

        await executeMonitor({
            id: monitor.id,
            organization_id: organization.id,
            resource_id: resource.id,
            monitor_type: "http",
            interval_seconds: 60,
            timeout_seconds: 5,
        });

        const execucoes = await adminClient.monitor_executions.findMany({
            where: { monitor_id: monitor.id },
        });
        expect(execucoes).toHaveLength(1);
        expect(execucoes[0]).toMatchObject({ check_status: "success", observed_state: "up" });
        expect(execucoes[0].finished_at!.getTime()).toBeGreaterThanOrEqual(
            execucoes[0].started_at.getTime(),
        );
        expect(execucoes[0].duration_ms).toBeGreaterThanOrEqual(0);

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.last_check_at).not.toBeNull();

        await server.close();
    });

    it("grava execucao de falha sem lancar quando o check falha", async () => {
        const { organization, resource } = await createFullTenant();
        const server = await startServer((_req, res) => res.writeHead(500).end());
        const monitor = await adminClient.monitors.create({
            data: {
                organization_id: organization.id,
                resource_id: resource.id,
                monitor_type: "http",
                name: "Monitor com falha",
                interval_seconds: 60,
                timeout_seconds: 5,
                next_check_at: new Date(),
            },
        });
        await adminClient.http_monitor_configs.create({
            data: { monitor_id: monitor.id, organization_id: organization.id, url: server.url },
        });

        await executeMonitor({
            id: monitor.id,
            organization_id: organization.id,
            resource_id: resource.id,
            monitor_type: "http",
            interval_seconds: 60,
            timeout_seconds: 5,
        });

        const [execucao] = await adminClient.monitor_executions.findMany({
            where: { monitor_id: monitor.id },
        });
        expect(execucao).toMatchObject({ check_status: "failure", observed_state: "down" });

        await server.close();
    });

    it("monitor sem config nao lanca -- so pula (estado inconsistente defensivo)", async () => {
        const { organization, resource } = await createFullTenant();
        const monitor = await adminClient.monitors.create({
            data: {
                organization_id: organization.id,
                resource_id: resource.id,
                monitor_type: "ping",
                name: "Sem config",
                interval_seconds: 60,
                timeout_seconds: 5,
                next_check_at: new Date(),
            },
        });
        // nunca criou ping_monitor_configs de proposito

        await expect(
            executeMonitor({
                id: monitor.id,
                organization_id: organization.id,
                resource_id: resource.id,
                monitor_type: "ping",
                interval_seconds: 60,
                timeout_seconds: 5,
            }),
        ).resolves.toBeUndefined();

        const execucoes = await adminClient.monitor_executions.findMany({
            where: { monitor_id: monitor.id },
        });
        expect(execucoes).toHaveLength(0);
    });

    it("monitor_type server_agent e ignorado silenciosamente (fora do escopo do MVP)", async () => {
        const { organization, resource } = await createFullTenant();

        await expect(
            executeMonitor({
                id: "00000000-0000-0000-0000-000000000000",
                organization_id: organization.id,
                resource_id: resource.id,
                monitor_type: "server_agent",
                interval_seconds: 60,
                timeout_seconds: 5,
            }),
        ).resolves.toBeUndefined();
    });
});
