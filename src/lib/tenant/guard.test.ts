import prisma, { basePrisma } from "@/config/database";
import { env } from "@/config/env";
import { MissingTenantContextError } from "@/lib/tenant/guard";
import { withTenant } from "@/lib/tenant/with-tenant";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";

// #10 -- transforma a falha silenciosa do RLS (query sem contexto de tenant
// volta `[]`) em erro explicito, para o bug aparecer no desenvolvimento em
// vez de meses depois em producao.

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("guarda de contexto de tenant", () => {
    it("lanca MissingTenantContextError nomeando modelo e operacao", async () => {
        await expect(prisma.organizations.findMany()).rejects.toBeInstanceOf(
            MissingTenantContextError,
        );
        await expect(prisma.organizations.findMany()).rejects.toThrow(
            /organizations\.findMany/,
        );
    });

    it("barra tambem escrita (create), nao so leitura", async () => {
        await expect(
            prisma.organizations.create({ data: { name: "X", slug: "x" } }),
        ).rejects.toBeInstanceOf(MissingTenantContextError);
    });

    it("query de negocio dentro de withTenant continua funcionando normalmente", async () => {
        const { user, organization } = await createFullTenant();

        const encontrada = await withTenant(
            { userId: user.id, organizationId: organization.id },
            (tx) => tx.organizations.findUnique({ where: { id: organization.id } }),
        );

        expect(encontrada?.id).toBe(organization.id);
    });

    it("health check ($queryRaw no client guardado) nao e afetado pela guarda", async () => {
        const resultado = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;

        expect(resultado).toEqual([{ ok: 1 }]);
    });

    describe("em producao", () => {
        const nodeEnvOriginal = env.NODE_ENV;

        afterEach(() => {
            // objeto e mutavel; o teste restaura o valor original ao final.
            env.NODE_ENV = nodeEnvOriginal;
        });

        it("loga em vez de lancar, e deixa a query passar", async () => {
            const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
            env.NODE_ENV = "production";

            await expect(prisma.organizations.findMany()).resolves.toEqual([]);
            expect(errorLog).toHaveBeenCalledTimes(1);
            expect(errorLog.mock.calls[0][0]).toMatch(/organizations\.findMany/);

            errorLog.mockRestore();
        });
    });
});
