import { createDomain, createIp, listResourcesController } from "@/controllers/resource.controller";
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

describe("listResourcesController", () => {
    it("pagina e filtra por resource_type", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createDomain(tx, session, { display_name: "D1", environment: "production", fqdn: "d1.com" }),
        );
        await withTenant(session, (tx) =>
            createDomain(tx, session, { display_name: "D2", environment: "production", fqdn: "d2.com" }),
        );
        await withTenant(session, (tx) =>
            createIp(tx, session, { display_name: "IP1", environment: "production", address: "10.0.0.1" }),
        );

        const resultado = await withTenant(session, (tx) =>
            listResourcesController(tx, { page: 1, per_page: 20, resource_type: "domain" }),
        );

        expect(resultado.total).toBe(3); // +1 do resource padrao ja criado por createFullTenant()
        expect(resultado.items.every((r) => r.resource_type === "domain")).toBe(true);
        const busca = await withTenant(session, (tx) => listResourcesController(tx, { page: 1, per_page: 1, q: "d1" }));
        expect(busca.total).toBe(1);
        expect(busca.items[0].display_name).toBe("D1");
    });

    it("respeita page/per_page", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        for (let i = 0; i < 5; i++) {
            await withTenant(session, (tx) =>
                createDomain(tx, session, {
                    display_name: `D${i}`,
                    environment: "production",
                    fqdn: `d${i}.com`,
                }),
            );
        }

        const pagina1 = await withTenant(session, (tx) =>
            listResourcesController(tx, { page: 1, per_page: 2 }),
        );
        const pagina2 = await withTenant(session, (tx) =>
            listResourcesController(tx, { page: 2, per_page: 2 }),
        );

        expect(pagina1.items).toHaveLength(2);
        expect(pagina2.items).toHaveLength(2);
        expect(pagina1.total).toBe(6); // +1 do resource padrao ja criado por createFullTenant()
        expect(pagina1.items.map((r) => r.id)).not.toEqual(pagina2.items.map((r) => r.id));
    });

    it("filtros combinados (resource_type + environment + status)", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createDomain(tx, session, { display_name: "Prod", environment: "production", fqdn: "prod.com" }),
        );
        await withTenant(session, (tx) =>
            createDomain(tx, session, { display_name: "Stg", environment: "staging", fqdn: "stg.com" }),
        );

        const resultado = await withTenant(session, (tx) =>
            listResourcesController(tx, {
                page: 1,
                per_page: 20,
                resource_type: "domain",
                environment: "staging",
                status: "active",
            }),
        );

        expect(resultado.total).toBe(1);
        expect(resultado.items[0].display_name).toBe("Stg");
    });
});
