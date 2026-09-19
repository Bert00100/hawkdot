import { createIp, deleteIp, getIp, updateIp } from "@/controllers/resource.controller";
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

describe("createIp / getIp / updateIp / deleteIp", () => {
    it("cria, le, atualiza e remove um IP -- aceita IPv4 e IPv6", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createIp(tx, session, {
                display_name: "Servidor principal",
                environment: "production",
                address: "203.0.113.10",
            }),
        );
        expect(criado.address).toBe("203.0.113.10");

        const atualizado = await withTenant(session, (tx) =>
            updateIp(tx, session, criado.id, { address: "2001:db8::1" }),
        );
        expect(atualizado.address).toContain(":");

        await withTenant(session, (tx) => deleteIp(tx, session, criado.id));
        const erro = await withTenant(session, (tx) => getIp(tx, criado.id)).catch((e) => e);
        expect(errorResponse(erro).status).toBe(404);
    });

    it("endereco duplicado retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createIp(tx, session, { display_name: "A", environment: "production", address: "198.51.100.5" }),
        );

        const erro = await withTenant(session, (tx) =>
            createIp(tx, session, { display_name: "B", environment: "production", address: "198.51.100.5" }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("viewer nao consegue criar (403)", async () => {
        const { organization } = await createFullTenant();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });
        const session = { userId: viewer.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            createIp(tx, session, { display_name: "X", environment: "production", address: "10.0.0.1" }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });
});
