import { GET } from "@/app/api/resources/route";
import { POST } from "@/app/api/resources/domains/route";
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

describe("GET /api/resources", () => {
    it("lista paginado e filtrado por resource_type via query string", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });
        const cookie = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

        await POST(
            new Request("http://localhost/api/resources/domains", {
                method: "POST",
                headers: cookie,
                body: JSON.stringify({ display_name: "Novo dominio", fqdn: "novo.com" }),
            }),
        );

        const response = await GET(
            new Request("http://localhost/api/resources?resource_type=domain&page=1&per_page=10", {
                headers: cookie,
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.items.every((r: { resource_type: string }) => r.resource_type === "domain")).toBe(
            true,
        );
        expect(body.page).toBe(1);
        expect(body.per_page).toBe(10);
    });

    it("sem sessao, 401", async () => {
        const response = await GET(new Request("http://localhost/api/resources"));
        expect(response.status).toBe(401);
    });
});
