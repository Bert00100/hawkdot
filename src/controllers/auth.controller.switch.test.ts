import { switchOrganization } from "@/controllers/auth.controller";
import { verifySessionToken } from "@/lib/auth/jwt";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createMember, createOrganization, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("switchOrganization", () => {
    it("troca para uma organizacao onde o usuario e membro ativo", async () => {
        const user = await createUser();
        const organizationA = await createOrganization({ slug: "org-a" });
        const organizationB = await createOrganization({ slug: "org-b" });
        await createMember(organizationA.id, user.id, { role: "owner" });
        await createMember(organizationB.id, user.id, { role: "operator" });

        const resultado = await switchOrganization(
            { userId: user.id, organizationId: organizationA.id },
            organizationB.id,
        );

        expect(resultado.organization).toMatchObject({ id: organizationB.id, slug: "org-b", role: "operator" });
    });

    it("o novo token carrega a organizacao alvo", async () => {
        const user = await createUser();
        const organizationA = await createOrganization();
        const organizationB = await createOrganization();
        await createMember(organizationA.id, user.id);
        await createMember(organizationB.id, user.id);

        const resultado = await switchOrganization(
            { userId: user.id, organizationId: organizationA.id },
            organizationB.id,
        );

        const payload = await verifySessionToken(resultado.token);
        expect(payload).toEqual({ user_id: user.id, organization_id: organizationB.id });
    });

    it("trocar para organizacao onde nao e membro retorna 403, sem emitir token", async () => {
        const user = await createUser();
        const organizationPropria = await createOrganization();
        const organizationAlheia = await createOrganization();
        await createMember(organizationPropria.id, user.id);
        // organizationAlheia nao tem createMember para este usuario.

        const erro = await switchOrganization(
            { userId: user.id, organizationId: organizationPropria.id },
            organizationAlheia.id,
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("membership com status diferente de active tambem e recusada (403)", async () => {
        const user = await createUser();
        const organizationPropria = await createOrganization();
        const organizationConvidado = await createOrganization();
        await createMember(organizationPropria.id, user.id);
        await adminClient.organization_members.create({
            data: {
                organization_id: organizationConvidado.id,
                user_id: user.id,
                role: "viewer",
                status: "invited",
            },
        });

        const erro = await switchOrganization(
            { userId: user.id, organizationId: organizationPropria.id },
            organizationConvidado.id,
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });
});
