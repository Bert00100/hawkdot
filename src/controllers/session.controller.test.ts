import { getMe } from "@/controllers/session.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createOrganization, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("getMe", () => {
    it("devolve usuario, organizacao ativa e a lista com uma organizacao (caso comum do signup)", async () => {
        const { user, organization, member } = await createFullTenant();

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            getMe(tx, { userId: user.id, organizationId: organization.id }),
        );

        expect(resultado.user).toEqual({ id: user.id, email: user.email, display_name: user.display_name });
        expect(resultado.organization).toEqual({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            role: member.role,
        });
        expect(resultado.organizations).toEqual([
            { id: organization.id, name: organization.name, slug: organization.slug, role: member.role },
        ]);
    });

    it("nunca devolve password_hash", async () => {
        const { user, organization } = await createFullTenant();

        const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            getMe(tx, { userId: user.id, organizationId: organization.id }),
        );

        expect(resultado.user).not.toHaveProperty("password_hash");
    });

    it("lista todas as organizacoes do usuario, mesmo as que nao sao a ativa no momento", async () => {
        const user = await createUser();
        const organizationA = await createOrganization({ slug: "org-a-do-usuario" });
        const organizationB = await createOrganization({ slug: "org-b-do-usuario" });
        await createMember(organizationA.id, user.id, { role: "owner" });
        await createMember(organizationB.id, user.id, { role: "admin" });

        const resultado = await withTenant({ userId: user.id, organizationId: organizationA.id }, (tx) =>
            getMe(tx, { userId: user.id, organizationId: organizationA.id }),
        );

        expect(resultado.organizations.map((o) => o.slug).sort()).toEqual([
            "org-a-do-usuario",
            "org-b-do-usuario",
        ]);
        // a organizacao B (nao ativa) precisa vir com name/slug corretos --
        // e o ponto que exigiu o JOIN dentro da funcao SECURITY DEFINER.
        const orgB = resultado.organizations.find((o) => o.slug === "org-b-do-usuario");
        expect(orgB).toEqual({
            id: organizationB.id,
            name: organizationB.name,
            slug: "org-b-do-usuario",
            role: "admin",
        });
    });

    it("organization e sempre o item de organizations cujo id bate com a sessao", async () => {
        const user = await createUser();
        const organizationA = await createOrganization({ slug: "ativa-agora" });
        const organizationB = await createOrganization({ slug: "outra-org" });
        await createMember(organizationA.id, user.id);
        await createMember(organizationB.id, user.id);

        const resultado = await withTenant({ userId: user.id, organizationId: organizationB.id }, (tx) =>
            getMe(tx, { userId: user.id, organizationId: organizationB.id }),
        );

        expect(resultado.organization.slug).toBe("outra-org");
    });
});
