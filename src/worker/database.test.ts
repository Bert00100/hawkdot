import { workerBasePrisma } from "@/worker/database";
import { withWorkerTenant } from "@/worker/with-worker-tenant";
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

describe("conexao do worker (#33)", () => {
    it("conecta com o login proprio (hawkdot_worker_login)", async () => {
        const rows = await workerBasePrisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`;

        expect(rows[0].current_user).toBe("hawkdot_worker_login");
    });

    it("le e escreve respeitando o isolamento por organizacao", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();

        const [visiveisParaA, visiveisParaB] = await Promise.all([
            withWorkerTenant(tenantA.organization.id, (tx) => tx.monitors.findMany()),
            withWorkerTenant(tenantB.organization.id, (tx) => tx.monitors.findMany()),
        ]);

        expect(visiveisParaA.map((m) => m.id)).toEqual([tenantA.monitor.id]);
        expect(visiveisParaB.map((m) => m.id)).toEqual([tenantB.monitor.id]);
    });

    it("nao consegue deletar monitores -- falta o grant, nem chega a avaliar RLS", async () => {
        const { organization, monitor } = await createFullTenant();

        const erro = await withWorkerTenant(organization.id, (tx) =>
            tx.monitors.delete({ where: { id: monitor.id } }),
        ).catch((e) => e);

        expect(erro).toBeInstanceOf(Error);
        expect(String(erro.message)).toMatch(/permission denied/i);

        const aindaExiste = await adminClient.monitors.findUnique({ where: { id: monitor.id } });
        expect(aindaExiste).not.toBeNull();
    });

    it("pode ler e atualizar monitors (tem grant SELECT/UPDATE)", async () => {
        const { organization, monitor } = await createFullTenant();

        const atualizado = await withWorkerTenant(organization.id, (tx) =>
            tx.monitors.update({ where: { id: monitor.id }, data: { last_check_at: new Date() } }),
        );

        expect(atualizado.last_check_at).not.toBeNull();
    });
});

describe("client guardado do worker", () => {
    it("operacao de modelo no default export (sem withWorkerTenant) lanca erro nomeado", async () => {
        const workerPrisma = (await import("@/worker/database")).default;

        await expect(workerPrisma.monitors.findMany()).rejects.toThrow(/fora de withTenant/);
    });
});
