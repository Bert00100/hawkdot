import { withTenant } from "@/lib/tenant/with-tenant";
import { countOrganizationMembers, listOrganizationMembers } from "@/models/organization-member.model";
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

describe("listOrganizationMembers / countOrganizationMembers", () => {
    it("traz nome e e-mail dos outros membros -- prova que o RLS de users nao bloqueia mais", async () => {
        const { user: owner, organization } = await createFullTenant();
        const outroUsuario = await createUser({ display_name: "Colega", email: "colega@teste.hawkdot" });
        await createMember(organization.id, outroUsuario.id, { role: "admin" });

        const membros = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            listOrganizationMembers(tx, { limit: 20, offset: 0 }),
        );

        const colega = membros.find((m) => m.user_id === outroUsuario.id);
        expect(colega).toMatchObject({
            email: "colega@teste.hawkdot",
            display_name: "Colega",
            role: "admin",
            status: "active",
        });
    });

    it("nao expoe password_hash (a funcao nem seleciona essa coluna)", async () => {
        const { user, organization } = await createFullTenant();

        const membros = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            listOrganizationMembers(tx, { limit: 20, offset: 0 }),
        );

        expect(membros[0]).not.toHaveProperty("password_hash");
    });

    it("respeita limit/offset", async () => {
        const { user, organization } = await createFullTenant();
        for (let i = 0; i < 3; i++) {
            const membro = await createUser();
            await createMember(organization.id, membro.id, { role: "viewer" });
        }

        const pagina1 = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            listOrganizationMembers(tx, { limit: 2, offset: 0 }),
        );
        const pagina2 = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            listOrganizationMembers(tx, { limit: 2, offset: 2 }),
        );

        expect(pagina1).toHaveLength(2);
        expect(pagina2).toHaveLength(2); // owner + 1 dos 3 viewers restantes
    });

    it("count bate com o total de membros", async () => {
        const { user, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "viewer" });

        const total = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            countOrganizationMembers(tx),
        );

        expect(total).toBe(2);
    });
});
