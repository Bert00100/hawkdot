import { createDomain, deleteDomain, getDomain, updateDomain } from "@/controllers/resource.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("createDomain / getDomain / updateDomain / deleteDomain", () => {
    it("owner cria um dominio: pai e filho gravados atomicamente", async () => {
        const { user, organization } = await createFullTenant();

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: user.id, organizationId: organization.id }, {
                display_name: "Site principal",
                environment: "production",
                fqdn: "exemplo.com",
            }),
        );

        expect(resultado).toMatchObject({
            display_name: "Site principal",
            environment: "production",
            status: "active",
            fqdn: "exemplo.com",
        });

        const resourceRow = await adminClient.resources.findUnique({ where: { id: resultado.id } });
        const domainRow = await adminClient.domain_resources.findUnique({
            where: { resource_id: resultado.id },
        });
        expect(resourceRow?.resource_type).toBe("domain");
        expect(domainRow?.fqdn).toBe("exemplo.com");
    });

    it.each(["operator"] as const)("%s consegue criar (tenant_app_insert permite)", async (role) => {
        const { organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role });

        const resultado = await withTenant({ userId: membro.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: membro.id, organizationId: organization.id }, {
                display_name: "Outro site",
                environment: "production",
                fqdn: "outro.com",
            }),
        );

        expect(resultado.fqdn).toBe("outro.com");
    });

    it("viewer nao consegue criar (403)", async () => {
        const { organization } = await createFullTenant();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });

        const erro = await withTenant({ userId: viewer.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: viewer.id, organizationId: organization.id }, {
                display_name: "Nao deveria existir",
                environment: "production",
                fqdn: "naodeveria.com",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("FQDN duplicado (inclusive com caixa diferente) retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: user.id, organizationId: organization.id }, {
                display_name: "Primeiro",
                environment: "production",
                fqdn: "duplicado.com",
            }),
        );

        const erro = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: user.id, organizationId: organization.id }, {
                display_name: "Segundo",
                environment: "production",
                fqdn: "Duplicado.COM",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("le, atualiza e remove um dominio existente", async () => {
        const { user, organization } = await createFullTenant();
        const criado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            createDomain(tx, { userId: user.id, organizationId: organization.id }, {
                display_name: "Nome original",
                environment: "production",
                fqdn: "original.com",
            }),
        );

        const lido = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            getDomain(tx, criado.id),
        );
        expect(lido.fqdn).toBe("original.com");

        const atualizado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            updateDomain(tx, { userId: user.id, organizationId: organization.id }, criado.id, {
                fqdn: "atualizado.com",
            }),
        );
        expect(atualizado.fqdn).toBe("atualizado.com");
        expect(atualizado.display_name).toBe("Nome original");

        await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            deleteDomain(tx, { userId: user.id, organizationId: organization.id }, criado.id),
        );

        const resourceRow = await adminClient.resources.findUnique({ where: { id: criado.id } });
        const domainRow = await adminClient.domain_resources.findUnique({
            where: { resource_id: criado.id },
        });
        expect(resourceRow).toBeNull();
        expect(domainRow).toBeNull(); // ON DELETE CASCADE na FK composta
    });

    it("recurso de outra organizacao nao e visivel (get 404)", async () => {
        const tenantA = await createFullTenant();
        const tenantB = await createFullTenant();
        const domainA = await withTenant(
            { userId: tenantA.user.id, organizationId: tenantA.organization.id },
            (tx) =>
                createDomain(tx, { userId: tenantA.user.id, organizationId: tenantA.organization.id }, {
                    display_name: "Da org A",
                    environment: "production",
                    fqdn: "da-org-a.com",
                }),
        );

        const erro = await withTenant(
            { userId: tenantB.user.id, organizationId: tenantB.organization.id },
            (tx) => getDomain(tx, domainA.id),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});
