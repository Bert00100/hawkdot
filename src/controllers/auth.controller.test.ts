import { signup } from "@/controllers/auth.controller";
import { verifyPassword } from "@/lib/auth/password";
import { findLoginCredentials } from "@/models/user.model";
import { basePrisma } from "@/config/database";
import { appClient } from "@/test-utils/app-client";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createOrganization } from "@/test-utils/factories";
import { errorResponse } from "@/lib/errors";

const validInput = {
    email: "nova@teste.hawkdot",
    password: "senha-forte-123",
    display_name: "Pessoa Nova",
    organization_name: "Organizacao Nova",
    organization_slug: "organizacao-nova",
};

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await appClient.$disconnect();
});

describe("signup", () => {
    it("cria usuario, organizacao e membership owner numa unica transacao", async () => {
        const resultado = await signup(validInput);

        expect(resultado.user.email).toBe("nova@teste.hawkdot");
        expect(resultado.organization.slug).toBe("organizacao-nova");

        // adminClient (BYPASSRLS) so para checar o estado do banco -- o proprio
        // signup ja roda como hawkdot_api_login por dentro de withTenant.
        const membership = await adminClient.organization_members.findUnique({
            where: {
                organization_id_user_id: {
                    organization_id: resultado.organization.id,
                    user_id: resultado.user.id,
                },
            },
        });

        expect(membership).toMatchObject({ role: "owner", status: "active" });
        expect(membership?.joined_at).not.toBeNull();
    });

    it("nao devolve password_hash na resposta", async () => {
        const resultado = await signup(validInput);

        expect(resultado.user).not.toHaveProperty("password_hash");
    });

    it("o usuario criado consegue logar em seguida (hash bate e credenciais existem)", async () => {
        const resultado = await signup(validInput);

        const credenciais = await findLoginCredentials(validInput.email);

        expect(credenciais?.id).toBe(resultado.user.id);
        expect(credenciais?.password_hash).not.toBeNull();
        await expect(
            verifyPassword(validInput.password, credenciais!.password_hash!),
        ).resolves.toBe(true);
    });

    it("e-mail duplicado vira 409 (via errorResponse), sem deixar usuario orfao", async () => {
        await signup(validInput);

        const erro = await signup({ ...validInput, organization_slug: "outra-org" }).catch((e) => e);
        expect(errorResponse(erro).status).toBe(409);

        // a segunda tentativa falhou inteira -- nao deve ter criado "outra-org"
        const orgOrfa = await adminClient.organizations.findFirst({
            where: { slug: "outra-org" },
        });
        expect(orgOrfa).toBeNull();
    });

    it("slug ja usado por outra organizacao tambem vira 409, sem deixar usuario orfao", async () => {
        await createOrganization({ slug: "organizacao-nova" });

        const erro = await signup(validInput).catch((e) => e);
        expect(errorResponse(erro).status).toBe(409);

        const usuarioOrfao = await adminClient.users.findFirst({
            where: { email: validInput.email },
        });
        expect(usuarioOrfao).toBeNull();
    });
});
