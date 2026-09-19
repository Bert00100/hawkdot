import prisma from "@/config/database";
import { withTenant } from "@/lib/tenant/with-tenant";
import { cleanDatabase } from "@/test-utils/cleanup";
import {
    createBrowserPushSubscription,
    createCredential,
    createFullTenant,
    createMember,
    createResource,
    createUser,
} from "@/test-utils/factories";

// Prova, com testes automatizados, que o isolamento multi-tenant funciona de
// verdade -- ele nao e garantido por codigo de aplicacao (nao ha
// `WHERE organization_id = ...` escrito a mao em lugar nenhum), e sim pelas
// policies de RLS do Postgres. Roda tudo via withTenant/prisma (role
// hawkdot_api_login, sujeito as policies), nunca via adminClient (que tem
// BYPASSRLS e invalidaria o teste).

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
});

describe("isolamento entre tenants", () => {
    it("org B nao consegue ler um recurso criado pela org A", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();
        const recursoDaA = await createResource(tenantA.organization.id);

        const encontrado = await withTenant(
            { userId: tenantB.user.id, organizationId: tenantB.organization.id },
            (tx) => tx.resources.findUnique({ where: { id: recursoDaA.id } }),
        );

        expect(encontrado).toBeNull();
    });

    it("org B nao consegue atualizar um recurso da org A", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();
        const recursoDaA = await createResource(tenantA.organization.id);

        await expect(
            withTenant(
                { userId: tenantB.user.id, organizationId: tenantB.organization.id },
                (tx) =>
                    tx.resources.update({
                        where: { id: recursoDaA.id },
                        data: { display_name: "Sequestrado" },
                    }),
            ),
        ).rejects.toThrow();
    });

    it("org B nao consegue deletar um recurso da org A", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();
        const recursoDaA = await createResource(tenantA.organization.id);

        await expect(
            withTenant(
                { userId: tenantB.user.id, organizationId: tenantB.organization.id },
                (tx) => tx.resources.delete({ where: { id: recursoDaA.id } }),
            ),
        ).rejects.toThrow();
    });

    it("sem contexto de tenant (client guardado fora do wrapper), a query lanca erro em vez de voltar vazia", async () => {
        await createResource((await createFullTenant()).organization.id);

        await expect(prisma.resources.findMany()).rejects.toThrow(
            /resources\.findMany[\s\S]*fora de withTenant/,
        );
    });

    it("membro viewer nao consegue inserir (tenant_app_insert exige owner/admin/operator)", async () => {
        const { organization } = await createFullTenant();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });

        await expect(
            withTenant({ userId: viewer.id, organizationId: organization.id }, (tx) =>
                tx.resources.create({
                    data: {
                        organization_id: organization.id,
                        resource_type: "domain",
                        display_name: "Tentativa de viewer",
                    },
                }),
            ),
        ).rejects.toThrow();
    });

    describe("credentials so e acessivel para owner/admin", () => {
        it("owner enxerga a credencial", async () => {
            const { user, organization } = await createFullTenant();
            const credencial = await createCredential(organization.id);

            const encontrada = await withTenant(
                { userId: user.id, organizationId: organization.id },
                (tx) => tx.credentials.findUnique({ where: { id: credencial.id } }),
            );

            expect(encontrada?.id).toBe(credencial.id);
        });

        it("operator nao enxerga a credencial", async () => {
            const { organization } = await createFullTenant();
            const credencial = await createCredential(organization.id);
            const operator = await createUser();
            await createMember(organization.id, operator.id, { role: "operator" });

            const encontrada = await withTenant(
                { userId: operator.id, organizationId: organization.id },
                (tx) => tx.credentials.findUnique({ where: { id: credencial.id } }),
            );

            expect(encontrada).toBeNull();
        });

        it("viewer nao enxerga a credencial", async () => {
            const { organization } = await createFullTenant();
            const credencial = await createCredential(organization.id);
            const viewer = await createUser();
            await createMember(organization.id, viewer.id, { role: "viewer" });

            const encontrada = await withTenant(
                { userId: viewer.id, organizationId: organization.id },
                (tx) => tx.credentials.findUnique({ where: { id: credencial.id } }),
            );

            expect(encontrada).toBeNull();
        });
    });

    describe("browser_push_subscriptions so e visivel para o proprio dono", () => {
        it("o dono enxerga a propria inscricao", async () => {
            const { organization, member } = await createFullTenant();
            const inscricao = await createBrowserPushSubscription(
                organization.id,
                member.user_id,
            );

            const encontrada = await withTenant(
                { userId: member.user_id, organizationId: organization.id },
                (tx) => tx.browser_push_subscriptions.findUnique({ where: { id: inscricao.id } }),
            );

            expect(encontrada?.id).toBe(inscricao.id);
        });

        it("outro membro da mesma organizacao nao enxerga a inscricao alheia", async () => {
            const { organization, member } = await createFullTenant();
            const inscricao = await createBrowserPushSubscription(
                organization.id,
                member.user_id,
            );

            const outroMembro = await createUser();
            await createMember(organization.id, outroMembro.id, { role: "admin" });

            const encontrada = await withTenant(
                { userId: outroMembro.id, organizationId: organization.id },
                (tx) => tx.browser_push_subscriptions.findUnique({ where: { id: inscricao.id } }),
            );

            expect(encontrada).toBeNull();
        });
    });
});
