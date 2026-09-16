import { adminClient } from "./admin-client";
import { appClient } from "./app-client";
import { cleanDatabase } from "./cleanup";
import { createFullTenant } from "./factories";

afterEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await adminClient.$disconnect();
    await appClient.$disconnect();
});

describe("factories", () => {
    it("cria a cadeia completa user -> org -> member -> resource -> monitor", async () => {
        const { user, organization, member, resource, monitor } = await createFullTenant();

        expect(user.id).toBeDefined();
        expect(organization.id).toBeDefined();
        expect(member.role).toBe("owner");
        expect(member.joined_at).not.toBeNull();
        expect(resource.organization_id).toBe(organization.id);
        expect(monitor.resource_id).toBe(resource.id);
        expect(monitor.organization_id).toBe(organization.id);
    });

    it("gera valores unicos a cada chamada", async () => {
        const primeiro = await createFullTenant();
        const segundo = await createFullTenant();

        expect(primeiro.user.email).not.toBe(segundo.user.email);
        expect(primeiro.organization.slug).not.toBe(segundo.organization.slug);
    });
});

describe("isolamento entre testes", () => {
    it("comeca com o banco vazio mesmo apos outros testes terem inserido dados", async () => {
        const usuarios = await adminClient.users.count();
        const organizacoes = await adminClient.organizations.count();

        expect(usuarios).toBe(0);
        expect(organizacoes).toBe(0);
    });
});

describe("separacao admin x app", () => {
    // O appClient conecta como hawkdot_api_login, que nao tem BYPASSRLS.
    // Sem o set_config do contexto de tenant, as policies filtram tudo.
    it("o appClient nao enxerga dados criados pelo adminClient sem contexto de tenant", async () => {
        await createFullTenant();

        expect(await adminClient.organizations.count()).toBe(1);
        expect(await appClient.organizations.count()).toBe(0);
    });
});
