import { inviteMember } from "@/controllers/organization-member.controller";
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

describe("inviteMember", () => {
    it("owner/admin cria o convite com status invited e invited_by preenchido", async () => {
        const { user: owner, organization } = await createFullTenant();
        const convidado = await createUser({ email: "convidado@teste.hawkdot" });

        const resultado = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            inviteMember(tx, { userId: owner.id, organizationId: organization.id }, {
                email: "convidado@teste.hawkdot",
                role: "operator",
            }),
        );

        expect(resultado).toEqual({ user_id: convidado.id, role: "operator", status: "invited" });

        const linha = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: convidado.id } },
        });
        expect(linha).toMatchObject({ status: "invited", invited_by: owner.id, joined_at: null });
    });

    it.each(["operator", "viewer"] as const)("%s nao consegue convidar (403)", async (role) => {
        const { organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role });
        const convidado = await createUser({ email: "outro@teste.hawkdot" });

        const erro = await withTenant({ userId: membro.id, organizationId: organization.id }, (tx) =>
            inviteMember(tx, { userId: membro.id, organizationId: organization.id }, {
                email: "outro@teste.hawkdot",
                role: "viewer",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
        expect(convidado.id).toEqual(expect.any(String));
    });

    it("convidar quem ja e membro retorna 409, nao 500", async () => {
        const { user: owner, organization } = await createFullTenant();
        const jaMembro = await createUser({ email: "ja-membro@teste.hawkdot" });
        await createMember(organization.id, jaMembro.id, { role: "viewer" });

        const erro = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            inviteMember(tx, { userId: owner.id, organizationId: organization.id }, {
                email: "ja-membro@teste.hawkdot",
                role: "admin",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("e-mail sem conta no sistema retorna 404 com mensagem clara (fluxo definido na issue)", async () => {
        const { user: owner, organization } = await createFullTenant();

        const erro = await withTenant({ userId: owner.id, organizationId: organization.id }, (tx) =>
            inviteMember(tx, { userId: owner.id, organizationId: organization.id }, {
                email: "nao-tem-conta@teste.hawkdot",
                role: "viewer",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
        const body = await errorResponse(erro).json();
        expect(body.error.message).toMatch(/criar uma conta/i);
    });
});
