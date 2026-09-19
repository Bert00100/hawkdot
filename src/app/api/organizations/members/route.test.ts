import { GET, POST } from "@/app/api/organizations/members/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
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

const requisicao = (path: string, cookieHeader: string) =>
    new Request(`http://localhost${path}`, { headers: { cookie: cookieHeader } });

describe("GET /api/organizations/members", () => {
    it("lista os membros com papel e status, sem password_hash", async () => {
        const { user, organization } = await createFullTenant();
        const membro2 = await createUser({ display_name: "Segunda Pessoa" });
        await createMember(organization.id, membro2.id, { role: "operator" });
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await GET(
            requisicao("/api/organizations/members", `${SESSION_COOKIE_NAME}=${token}`),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.total).toBe(2);
        expect(body.items).toHaveLength(2);
        expect(body.items.every((m: object) => !("password_hash" in m))).toBe(true);
    });

    it("aceita page/per_page na query string", async () => {
        const { user, organization } = await createFullTenant();
        for (let i = 0; i < 3; i++) {
            const membro = await createUser();
            await createMember(organization.id, membro.id);
        }
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await GET(
            requisicao(
                "/api/organizations/members?page=2&per_page=2",
                `${SESSION_COOKIE_NAME}=${token}`,
            ),
        );

        const body = await response.json();
        expect(body.page).toBe(2);
        expect(body.per_page).toBe(2);
        expect(body.items).toHaveLength(2);
    });

    it("sem sessao, 401", async () => {
        const response = await GET(new Request("http://localhost/api/organizations/members"));
        expect(response.status).toBe(401);
    });
});

describe("POST /api/organizations/members", () => {
    it("owner convida um usuario existente e responde 201", async () => {
        const { user, organization } = await createFullTenant();
        const convidado = await createUser({ email: "convidado-rota@teste.hawkdot" });
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await POST(
            new Request("http://localhost/api/organizations/members", {
                method: "POST",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
                body: JSON.stringify({ email: "convidado-rota@teste.hawkdot", role: "operator" }),
            }),
        );

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body).toEqual({ user_id: convidado.id, role: "operator", status: "invited" });
    });

    it("email invalido no corpo retorna 400", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await POST(
            new Request("http://localhost/api/organizations/members", {
                method: "POST",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
                body: JSON.stringify({ email: "nao-e-email", role: "viewer" }),
            }),
        );

        expect(response.status).toBe(400);
    });
});
