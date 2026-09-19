import { GET } from "@/app/api/me/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicaoCom = (cookieHeader?: string) =>
    new Request("http://localhost/api/me", { headers: cookieHeader ? { cookie: cookieHeader } : {} });

describe("GET /api/me", () => {
    it("devolve usuario, organizacao ativa e a lista de organizacoes", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await GET(requisicaoCom(`${SESSION_COOKIE_NAME}=${token}`));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.user.email).toBe(user.email);
        expect(body.organization.id).toBe(organization.id);
        expect(body.organizations).toHaveLength(1);
        expect(body.user).not.toHaveProperty("password_hash");
    });

    it("sem sessao valida, responde 401", async () => {
        const response = await GET(requisicaoCom());

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error.code).toBe("UNAUTHENTICATED");
    });
});
