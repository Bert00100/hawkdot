import { changeMemberRole, removeMember } from "@/controllers/organization-member.role.controller";
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

describe("changeMemberRole", () => {
    it("owner altera o papel de outro membro", async () => {
        const { user: owner, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "viewer" });

        const resultado = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: owner.id, organizationId: organization.id }, membro.id, "operator"),
        );

        expect(resultado).toEqual({ user_id: membro.id, role: "operator", status: "active" });
    });

    it.each(["operator", "viewer"] as const)("%s nao consegue alterar papel (403)", async (role) => {
        const { organization } = await createFullTenant();
        const ator = await createUser();
        await createMember(organization.id, ator.id, { role });
        const alvo = await createUser();
        await createMember(organization.id, alvo.id, { role: "viewer" });

        const erro = await withTenant({ userId: ator.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: ator.id, organizationId: organization.id }, alvo.id, "operator"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("admin nao consegue alterar o papel de um owner", async () => {
        const { user: owner, organization } = await createFullTenant();
        const admin = await createUser();
        await createMember(organization.id, admin.id, { role: "admin" });

        const erro = await withTenant({ userId: admin.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: admin.id, organizationId: organization.id }, owner.id, "admin"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("owner consegue promover outro membro a owner", async () => {
        const { user: owner, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "admin" });

        const resultado = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: owner.id, organizationId: organization.id }, membro.id, "owner"),
        );

        expect(resultado.role).toBe("owner");
    });

    it("rebaixar o ultimo owner e bloqueado, mesmo pedido pelo proprio owner", async () => {
        const { user: owner, organization } = await createFullTenant();

        const erro = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: owner.id, organizationId: organization.id }, owner.id, "admin"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);

        const aindaOwner = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: owner.id } },
        });
        expect(aindaOwner?.role).toBe("owner");
    });

    it("rebaixar um owner permitido quando ha outro owner ativo", async () => {
        const { user: ownerA, organization } = await createFullTenant();
        const ownerB = await createUser();
        await createMember(organization.id, ownerB.id, { role: "owner" });

        const resultado = await withTenant({ userId: ownerA.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: ownerA.id, organizationId: organization.id }, ownerB.id, "admin"),
        );

        expect(resultado.role).toBe("admin");
    });

    it("membro inexistente na organizacao retorna 404", async () => {
        const { user: owner, organization } = await createFullTenant();
        const foraDaOrg = await createUser();

        const erro = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            changeMemberRole(tx, { userId: owner.id, organizationId: organization.id }, foraDaOrg.id, "admin"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});

describe("removeMember", () => {
    it("owner remove um membro comum", async () => {
        const { user: owner, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "viewer" });

        await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            removeMember(tx, { userId: owner.id, organizationId: organization.id }, membro.id),
        );

        const linha = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: membro.id } },
        });
        expect(linha).toBeNull();
    });

    it("remover o ultimo owner e bloqueado", async () => {
        const { user: owner, organization } = await createFullTenant();

        const erro = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            removeMember(tx, { userId: owner.id, organizationId: organization.id }, owner.id),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);

        const aindaExiste = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: owner.id } },
        });
        expect(aindaExiste).not.toBeNull();
    });

    it("remover um owner e permitido quando ha outro owner ativo", async () => {
        const { user: ownerA, organization } = await createFullTenant();
        const ownerB = await createUser();
        await createMember(organization.id, ownerB.id, { role: "owner" });

        await withTenant({ userId: ownerA.id, organizationId: organization.id }, (tx) =>
            removeMember(tx, { userId: ownerA.id, organizationId: organization.id }, ownerB.id),
        );

        const linha = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: ownerB.id } },
        });
        expect(linha).toBeNull();
    });

    it("admin nao consegue remover um owner", async () => {
        const { user: owner, organization } = await createFullTenant();
        const admin = await createUser();
        await createMember(organization.id, admin.id, { role: "admin" });

        const erro = await withTenant({ userId: admin.id, organizationId: organization.id }, (tx) =>
            removeMember(tx, { userId: admin.id, organizationId: organization.id }, owner.id),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it.each(["operator", "viewer"] as const)("%s nao consegue remover ninguem (403)", async (role) => {
        const { organization } = await createFullTenant();
        const ator = await createUser();
        await createMember(organization.id, ator.id, { role });
        const alvo = await createUser();
        await createMember(organization.id, alvo.id, { role: "viewer" });

        const erro = await withTenant({ userId: ator.id, organizationId: organization.id }, (tx) =>
            removeMember(tx, { userId: ator.id, organizationId: organization.id }, alvo.id),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });
});
