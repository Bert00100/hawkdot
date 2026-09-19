import { createEndpoint, deleteEndpoint, getEndpoint, updateEndpoint } from "@/controllers/resource.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("createEndpoint / getEndpoint / updateEndpoint / deleteEndpoint", () => {
    it("cria, le, atualiza e remove um endpoint", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createEndpoint(tx, session, {
                display_name: "API principal",
                environment: "production",
                url: "https://api.exemplo.com/health",
            }),
        );
        expect(criado.url).toBe("https://api.exemplo.com/health");

        const lido = await withTenant(session, (tx) => getEndpoint(tx, criado.id));
        expect(lido.url).toBe(criado.url);

        const atualizado = await withTenant(session, (tx) =>
            updateEndpoint(tx, session, criado.id, { url: "https://api.exemplo.com/v2/health" }),
        );
        expect(atualizado.url).toBe("https://api.exemplo.com/v2/health");

        await withTenant(session, (tx) => deleteEndpoint(tx, session, criado.id));
        const erro = await withTenant(session, (tx) => getEndpoint(tx, criado.id)).catch((e) => e);
        expect(errorResponse(erro).status).toBe(404);
    });

    it("URL duplicada (case-sensitive, decisao documentada de nao normalizar) retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createEndpoint(tx, session, {
                display_name: "A",
                environment: "production",
                url: "https://exemplo.com/api",
            }),
        );

        const erro = await withTenant(session, (tx) =>
            createEndpoint(tx, session, {
                display_name: "B",
                environment: "production",
                url: "https://exemplo.com/api",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("viewer nao consegue criar (403)", async () => {
        const { organization } = await createFullTenant();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });
        const session = { userId: viewer.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            createEndpoint(tx, session, {
                display_name: "X",
                environment: "production",
                url: "https://naodeveria.com",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });
});
