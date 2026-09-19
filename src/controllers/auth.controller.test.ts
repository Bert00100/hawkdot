import { login, signup } from "@/controllers/auth.controller";
import { verifySessionToken } from "@/lib/auth/jwt";
import * as passwordModule from "@/lib/auth/password";
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

describe("login", () => {
    const signupParaLogin = (overrides: Partial<typeof validInput> = {}) =>
        signup({ ...validInput, ...overrides });

    it("credenciais validas devolvem token e os dados do usuario", async () => {
        const cadastro = await signupParaLogin();

        const resultado = await login({ email: validInput.email, password: validInput.password });

        expect(resultado.token).toEqual(expect.any(String));
        expect(resultado.user.id).toBe(cadastro.user.id);
        expect(resultado.organization_id).toBe(cadastro.organization.id);
    });

    it("nao devolve password_hash na resposta", async () => {
        await signupParaLogin();

        const resultado = await login({ email: validInput.email, password: validInput.password });

        expect(resultado.user).not.toHaveProperty("password_hash");
    });

    it("o token carrega user_id e organization_id", async () => {
        const cadastro = await signupParaLogin();

        const resultado = await login({ email: validInput.email, password: validInput.password });
        const payload = await verifySessionToken(resultado.token);

        expect(payload).toEqual({
            user_id: cadastro.user.id,
            organization_id: cadastro.organization.id,
        });
    });

    it("atualiza last_login_at", async () => {
        const cadastro = await signupParaLogin();

        await login({ email: validInput.email, password: validInput.password });

        const user = await adminClient.users.findUnique({ where: { id: cadastro.user.id } });
        expect(user?.last_login_at).not.toBeNull();
    });

    it("senha errada e email inexistente devolvem exatamente a mesma resposta 401", async () => {
        await signupParaLogin();

        const senhaErrada = await login({ email: validInput.email, password: "senha-errada-000" }).catch(
            (e) => e,
        );
        const emailInexistente = await login({
            email: "nao-existe@teste.hawkdot",
            password: "qualquer-coisa-123",
        }).catch((e) => e);

        expect(errorResponse(senhaErrada).status).toBe(401);
        expect(errorResponse(emailInexistente).status).toBe(401);
        await expect(errorResponse(senhaErrada).json()).resolves.toEqual(
            await errorResponse(emailInexistente).json(),
        );
    });

    it("usuario com status disabled nao consegue logar (mesma resposta 401)", async () => {
        const cadastro = await signupParaLogin();
        await adminClient.users.update({ where: { id: cadastro.user.id }, data: { status: "disabled" } });

        const erro = await login({ email: validInput.email, password: validInput.password }).catch(
            (e) => e,
        );

        expect(errorResponse(erro).status).toBe(401);
    });

    it("faz o trabalho de hash mesmo quando o e-mail nao existe (resistencia a timing attack)", async () => {
        await signupParaLogin();

        // Nao mockamos verifyPassword: o ponto do teste e provar que o
        // trabalho de CPU do argon2id realmente roda nos dois casos. Um bug
        // tipico aqui e um "if (!credentials) throw" antes de chamar
        // verifyPassword, que tornaria o caminho de e-mail inexistente quase
        // instantaneo -- exatamente o que revelaria a existencia da conta
        // pelo tempo de resposta. Medimos que ambos os caminhos levam um
        // tempo compativel com um hash real (nao um retorno adiantado).
        const medir = async (input: { email: string; password: string }) => {
            const inicio = performance.now();
            await login(input).catch(() => {});
            return performance.now() - inicio;
        };

        const duracaoSenhaErrada = await medir({
            email: validInput.email,
            password: "senha-errada-000",
        });
        const duracaoEmailInexistente = await medir({
            email: "nao-existe@teste.hawkdot",
            password: "qualquer-coisa-123",
        });

        // Verificacao real de argon2id (OWASP m=19MiB/t=2) fica na casa de
        // dezenas de ms -- um early-return ficaria abaixo de ~1ms.
        expect(duracaoSenhaErrada).toBeGreaterThan(3);
        expect(duracaoEmailInexistente).toBeGreaterThan(3);
    });

    it("usuario sem nenhuma organizacao ativa (estado defensivo) nao consegue logar", async () => {
        const { hashPassword } = passwordModule;
        const hash = await hashPassword(validInput.password);
        const usuarioOrfao = await adminClient.users.create({
            data: { email: "orfao@teste.hawkdot", password_hash: hash, display_name: "Orfao" },
        });

        const erro = await login({ email: "orfao@teste.hawkdot", password: validInput.password }).catch(
            (e) => e,
        );

        expect(errorResponse(erro).status).toBe(500);
        expect(usuarioOrfao.id).toEqual(expect.any(String));
    });
});
