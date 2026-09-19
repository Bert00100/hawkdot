import { POST } from "@/app/api/auth/switch-organization/route";
import { GET as meRoute } from "@/app/api/me/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createMember, createOrganization, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicao = (cookieHeader: string, body: unknown) =>
    new Request("http://localhost/api/auth/switch-organization", {
        method: "POST",
        headers: { cookie: cookieHeader },
        body: JSON.stringify(body),
    });

describe("POST /api/auth/switch-organization", () => {
    it("troca a organizacao ativa e as consultas seguintes (via /me) enxergam a nova organizacao", async () => {
        const user = await createUser();
        const organizationA = await createOrganization({ slug: "org-origem" });
        const organizationB = await createOrganization({ slug: "org-destino" });
        await createMember(organizationA.id, user.id, { role: "owner" });
        await createMember(organizationB.id, user.id, { role: "admin" });
        const tokenInicial = await signSessionToken({
            user_id: user.id,
            organization_id: organizationA.id,
        });

        const response = await POST(
            requisicao(`${SESSION_COOKIE_NAME}=${tokenInicial}`, { organization_id: organizationB.id }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.organization.slug).toBe("org-destino");

        const novoToken = response.cookies.get(SESSION_COOKIE_NAME)?.value;
        const me = await meRoute(
            new Request("http://localhost/api/me", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${novoToken}` },
            }),
        );
        const meBody = await me.json();

        expect(meBody.organization.slug).toBe("org-destino");
    });

    it("trocar para organizacao onde nao e membro responde 403", async () => {
        const user = await createUser();
        const organizationPropria = await createOrganization();
        const organizationAlheia = await createOrganization();
        await createMember(organizationPropria.id, user.id);
        const token = await signSessionToken({
            user_id: user.id,
            organization_id: organizationPropria.id,
        });

        const response = await POST(
            requisicao(`${SESSION_COOKIE_NAME}=${token}`, { organization_id: organizationAlheia.id }),
        );

        expect(response.status).toBe(403);
    });

    it("sem sessao valida responde 401", async () => {
        const response = await POST(
            requisicao("", { organization_id: "00000000-0000-0000-0000-000000000000" }),
        );

        expect(response.status).toBe(401);
    });
});
