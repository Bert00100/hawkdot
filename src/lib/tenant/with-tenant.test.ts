import prisma from "@/config/database";
import { withTenant } from "@/lib/tenant/with-tenant";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createOrganization, createUser } from "@/test-utils/factories";

// prisma (o singleton) aponta para hawkdot_test com o role hawkdot_api_login
// em NODE_ENV=test (ver src/config/database.ts) -- estes testes rodam sob RLS
// de verdade, nao contra um client com BYPASSRLS.

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
});

describe("withTenant", () => {
    it("enxerga os dados da organizacao informada", async () => {
        const { user, organization } = await createFullTenant();

        const encontrada = await withTenant(
            { userId: user.id, organizationId: organization.id },
            (tx) => tx.organizations.findUnique({ where: { id: organization.id } }),
        );

        expect(encontrada?.id).toBe(organization.id);
    });

    it("usar o client `prisma` guardado fora do wrapper lanca erro nomeado (#10), nao volta vazio silenciosamente", async () => {
        const { organization } = await createFullTenant();

        await expect(
            prisma.organizations.findUnique({ where: { id: organization.id } }),
        ).rejects.toThrow(/organizations\.findUnique[\s\S]*fora de withTenant/);
    });

    it("nao enxerga dados de outra organizacao", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();

        const resultado = await withTenant(
            { userId: tenantA.user.id, organizationId: tenantA.organization.id },
            (tx) => tx.organizations.findUnique({ where: { id: tenantB.organization.id } }),
        );

        expect(resultado).toBeNull();
    });

    it("duas chamadas concorrentes com organizacoes diferentes nao vazam contexto entre si", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();

        const [resultadoA, resultadoB] = await Promise.all([
            withTenant(
                { userId: tenantA.user.id, organizationId: tenantA.organization.id },
                (tx) => tx.organizations.findMany(),
            ),
            withTenant(
                { userId: tenantB.user.id, organizationId: tenantB.organization.id },
                (tx) => tx.organizations.findMany(),
            ),
        ]);

        expect(resultadoA.map((o) => o.id)).toEqual([tenantA.organization.id]);
        expect(resultadoB.map((o) => o.id)).toEqual([tenantB.organization.id]);
    });

    it("sem organizationId, so o contexto de usuario fica definido", async () => {
        const user = await createUser();
        await createOrganization();

        const organizacoesVisiveis = await withTenant({ userId: user.id }, (tx) =>
            tx.organizations.findMany(),
        );

        // organizations_member_select exige id = current_organization_id(),
        // que aqui esta ausente -- nenhuma organizacao fica visivel.
        expect(organizacoesVisiveis).toEqual([]);
    });

    it("nao interpola o UUID cru no SQL (usa parametro do $executeRaw)", async () => {
        const { user, organization } = await createFullTenant();
        const idComTentativaDeInjecao = `${organization.id}'; DROP TABLE hawkdot.organizations; --`;

        await expect(
            withTenant(
                { userId: user.id, organizationId: idComTentativaDeInjecao },
                (tx) => tx.organizations.findMany(),
            ),
        ).rejects.toThrow();

        const aindaExiste = await withTenant(
            { userId: user.id, organizationId: organization.id },
            (tx) => tx.organizations.findUnique({ where: { id: organization.id } }),
        );
        expect(aindaExiste).not.toBeNull();
    });
});
