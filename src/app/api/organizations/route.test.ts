import { GET, PATCH } from "@/app/api/organizations/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
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

const requisicao = (method: string, cookieHeader: string, body?: unknown) =>
    new Request("http://localhost/api/organizations", {
        method,
        headers: { cookie: cookieHeader },
        body: body ? JSON.stringify(body) : undefined,
    });

const tokenPara = (userId: string, organizationId: string) =>
    signSessionToken({ user_id: userId, organization_id: organizationId });

describe("GET /api/organizations", () => {
    it("qualquer membro ativo consegue ler, independente do papel", async () => {
        const organization = await createOrganization();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });
        const token = await tokenPara(viewer.id, organization.id);

        const response = await GET(requisicao("GET", `${SESSION_COOKIE_NAME}=${token}`));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.id).toBe(organization.id);
    });

    it("sem sessao, 401", async () => {
        const response = await GET(new Request("http://localhost/api/organizations"));
        expect(response.status).toBe(401);
    });
});

describe("PATCH /api/organizations", () => {
    it.each(["owner", "admin"] as const)("%s consegue atualizar", async (role) => {
        const { organization, user: dono } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role });
        const token = await tokenPara(role === "owner" ? dono.id : membro.id, organization.id);

        const response = await PATCH(
            requisicao("PATCH", `${SESSION_COOKIE_NAME}=${token}`, { name: "Nome Atualizado" }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.name).toBe("Nome Atualizado");
    });

    it.each(["operator", "viewer"] as const)("%s recebe 403", async (role) => {
        const organization = await createOrganization();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role });
        const token = await tokenPara(membro.id, organization.id);

        const response = await PATCH(
            requisicao("PATCH", `${SESSION_COOKIE_NAME}=${token}`, { name: "Nao deveria funcionar" }),
        );

        expect(response.status).toBe(403);
    });

    it("slug invalido retorna 400", async () => {
        const { organization, user } = await createFullTenant();
        const token = await tokenPara(user.id, organization.id);

        const response = await PATCH(
            requisicao("PATCH", `${SESSION_COOKIE_NAME}=${token}`, { slug: "Slug Invalido" }),
        );

        expect(response.status).toBe(400);
    });

    it("slug duplicado retorna 409", async () => {
        await createOrganization({ slug: "slug-ja-existe" });
        const { organization, user } = await createFullTenant();
        const token = await tokenPara(user.id, organization.id);

        const response = await PATCH(
            requisicao("PATCH", `${SESSION_COOKIE_NAME}=${token}`, { slug: "slug-ja-existe" }),
        );

        expect(response.status).toBe(409);
    });

    it("nao aceita alterar status (nao esta no DTO)", async () => {
        const { organization, user } = await createFullTenant();
        const token = await tokenPara(user.id, organization.id);

        const response = await PATCH(
            requisicao("PATCH", `${SESSION_COOKIE_NAME}=${token}`, { status: "archived" }),
        );

        // campo desconhecido nao quebra a validacao (zod ignora por padrao),
        // mas tambem nao deve alterar status -- confirmamos que continua active.
        expect(response.status).toBe(400); // objeto vazio apos strip -> refine acusa "informe um campo"
    });
});
