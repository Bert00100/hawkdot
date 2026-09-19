import { createMonitorController, listMonitorsController } from "@/controllers/monitor.controller";
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
});

describe("listMonitorsController", () => {
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
