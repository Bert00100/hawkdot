import { reserveDueMonitors } from "@/worker/scheduler.model";
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

// createFullTenant() ja cria um monitor com next_check_at = agora (mesmo
// default usado em createMonitor, #30/#34) -- fica "devido" desde o inicio.

describe("reserveDueMonitors", () => {
    it("encontra um monitor vencido e devolve os campos necessarios ao scheduler", async () => {
        const { organization, monitor, resource } = await createFullTenant();

        const reservados = await reserveDueMonitors(10);

        expect(reservados).toHaveLength(1);
        expect(reservados[0]).toMatchObject({
            id: monitor.id,
            organization_id: organization.id,
            resource_id: resource.id,
            monitor_type: "http",
        });
    });

    it("avanca next_check_at a partir de interval_seconds no ato da reserva", async () => {
        const { monitor } = await createFullTenant();
        const antes = new Date();

        await reserveDueMonitors(10);

        const atualizado = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(atualizado?.next_check_at).not.toBeNull();
        expect(atualizado!.next_check_at!.getTime()).toBeGreaterThan(
            antes.getTime() + (monitor.interval_seconds ?? 0) * 1000 - 2000,
        );
    });

    it("monitor com next_check_at no futuro nao e reservado", async () => {
        const { monitor } = await createFullTenant();
        await adminClient.monitors.update({
            where: { id: monitor.id },
            data: { next_check_at: new Date(Date.now() + 3600_000) },
        });

        const reservados = await reserveDueMonitors(10);

        expect(reservados).toHaveLength(0);
    });

    it("monitor pausado ou arquivado nao e reservado mesmo vencido", async () => {
        const { monitor } = await createFullTenant();
        await adminClient.monitors.update({ where: { id: monitor.id }, data: { status: "paused" } });

        const reservados = await reserveDueMonitors(10);

        expect(reservados).toHaveLength(0);
    });

    it("respeita o limite pedido", async () => {
        const { organization, resource } = await createFullTenant();
        for (let i = 0; i < 4; i++) {
            await adminClient.monitors.create({
                data: {
                    organization_id: organization.id,
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: `Monitor ${i}`,
                    interval_seconds: 60,
                    next_check_at: new Date(),
                },
            });
        }
        // + o monitor padrao do createFullTenant() = 5 devidos no total

        const reservados = await reserveDueMonitors(3);

        expect(reservados).toHaveLength(3);
    });

    it("duas reservas concorrentes nao pegam o mesmo monitor (SKIP LOCKED)", async () => {
        const { organization, resource } = await createFullTenant();
        for (let i = 0; i < 5; i++) {
            await adminClient.monitors.create({
                data: {
                    organization_id: organization.id,
                    resource_id: resource.id,
                    monitor_type: "ping",
                    name: `Concorrente ${i}`,
                    interval_seconds: 60,
                    next_check_at: new Date(),
                },
            });
        }
        // 6 monitores devidos no total (5 + o padrao do createFullTenant()).

        const [loteA, loteB] = await Promise.all([reserveDueMonitors(3), reserveDueMonitors(3)]);

        const idsA = loteA.map((m) => m.id);
        const idsB = loteB.map((m) => m.id);
        const intersecao = idsA.filter((id) => idsB.includes(id));

        expect(loteA.length + loteB.length).toBe(6);
        expect(intersecao).toEqual([]);
    });
});
