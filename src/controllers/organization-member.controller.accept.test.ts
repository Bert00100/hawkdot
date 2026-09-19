import { acceptInvite } from "@/controllers/organization-member.controller";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("acceptInvite", () => {
    it("convidado aceita o proprio convite: status vira active e joined_at e preenchido", async () => {
        const { organization } = await createFullTenant();
        const convidado = await createUser();
        await adminClient.organization_members.create({
            data: { organization_id: organization.id, user_id: convidado.id, role: "viewer", status: "invited" },
        });

        const resultado = await acceptInvite(convidado.id, organization.id);

        expect(resultado).toEqual({ organization_id: organization.id, role: "viewer", status: "active" });

        const linha = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: convidado.id } },
        });
        expect(linha?.status).toBe("active");
        expect(linha?.joined_at).not.toBeNull();
    });

    it("ninguem consegue aceitar convite de outra pessoa", async () => {
        const { organization } = await createFullTenant();
        const convidado = await createUser();
        await adminClient.organization_members.create({
            data: { organization_id: organization.id, user_id: convidado.id, role: "viewer", status: "invited" },
        });
        const intruso = await createUser();

        const erro = await acceptInvite(intruso.id, organization.id).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);

        // o convite original continua intacto, ninguem mais virou membro
        const linhaOriginal = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: convidado.id } },
        });
        expect(linhaOriginal?.status).toBe("invited");
        const linhaIntruso = await adminClient.organization_members.findUnique({
            where: { organization_id_user_id: { organization_id: organization.id, user_id: intruso.id } },
        });
        expect(linhaIntruso).toBeNull();
    });

    it("convite ja aceito (nao mais 'invited') nao pode ser aceito de novo", async () => {
        const { organization } = await createFullTenant();
        const membro = await createUser();
        await adminClient.organization_members.create({
            data: {
                organization_id: organization.id,
                user_id: membro.id,
                role: "viewer",
                status: "active",
                joined_at: new Date(),
            },
        });

        const erro = await acceptInvite(membro.id, organization.id).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });

    it("convite inexistente (organizacao errada ou nunca convidado) responde 404", async () => {
        const { organization: organizacaoQualquer } = await createFullTenant();
        const usuarioSemConvite = await createUser();

        const erro = await acceptInvite(usuarioSemConvite.id, organizacaoQualquer.id).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});
