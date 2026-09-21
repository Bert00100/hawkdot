import { createMonitorController, getMonitor, listMonitorsController } from "@/controllers/monitor.controller";
import { adminClient } from "@/test-utils/admin-client";
import { createMonitorSchema } from "@/lib/dto/monitor.dto";
import { parseInput } from "@/lib/dto";
import { withTenant } from "@/lib/tenant/with-tenant";
import { basePrisma } from "@/config/database";
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

describe("listMonitorsController", () => {
    it("exibe apenas a ultima execucao real, sem detalhes internos ou dados de outro tenant", async () => {
        const { user, organization, monitor } = await createFullTenant();
        const other = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await adminClient.http_monitor_configs.create({ data: {
            monitor_id: monitor.id, organization_id: organization.id, url: "https://example.com",
        } });
        const before = await withTenant(session, (tx) => getMonitor(tx, monitor.id));
        expect(before).toMatchObject({ last_check_at: null, last_execution: null });
        const started = new Date();
        await adminClient.monitor_executions.create({ data: {
            organization_id: organization.id, monitor_id: monitor.id,
            check_status: "error", observed_state: "down", started_at: new Date(started.getTime() - 1000),
            summary: "erro antigo", response_time_ms: 999,
        } });
        await adminClient.monitor_executions.create({ data: {
            organization_id: organization.id, monitor_id: monitor.id,
            check_status: "success", observed_state: "up", started_at: started,
            finished_at: started, response_time_ms: 123, summary: "HTTP 200",
            details: { secret: "nao deve sair" },
        } });
        const result = await withTenant(session, (tx) => listMonitorsController(tx, { page: 1, per_page: 20 }));
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ last_execution: { response_time_ms: 123, summary: "HTTP 200" } });
        expect(JSON.stringify(result)).not.toContain("nao deve sair");
        await adminClient.monitor_executions.create({ data: {
            organization_id: organization.id, monitor_id: monitor.id,
            check_status: "error", observed_state: "down", started_at: new Date(started.getTime() + 1000),
            summary: "fetch https://user:segredo@example.test?token=segredo falhou",
        } });
        const errorResult = await withTenant(session, (tx) => getMonitor(tx, monitor.id));
        expect(errorResult.last_execution?.summary).toBe("Não foi possível concluir a checagem.");
        expect(JSON.stringify(errorResult)).not.toContain("segredo");
        await expect(withTenant(session, (tx) => getMonitor(tx, other.monitor.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("pagina e filtra por monitor_type", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "HTTP 1",
                    config: { url: "https://exemplo.com/1" },
                }),
            ),
        );
        await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "ping",
                    name: "Ping 1",
                    config: { host: "exemplo.com" },
                }),
            ),
        );

        const resultado = await withTenant(session, (tx) =>
            listMonitorsController(tx, { page: 1, per_page: 20, monitor_type: "http" }),
        );

        // +1 do monitor padrao (tipo http) ja criado por createFullTenant()
        expect(resultado.total).toBe(2);
        expect(resultado.items.every((m) => m.monitor_type === "http")).toBe(true);
        const busca = await withTenant(session, (tx) => listMonitorsController(tx, { page: 1, per_page: 1, q: "http 1" }));
        expect(busca.total).toBe(1);
        expect(busca.items[0].name).toBe("HTTP 1");
    });

    it("filtra por status", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "Ativo",
                    config: { url: "https://ativo.com" },
                }),
            ),
        );

        const resultado = await withTenant(session, (tx) =>
            listMonitorsController(tx, { page: 1, per_page: 20, status: "paused" }),
        );

        expect(resultado.total).toBe(0);
    });
});
