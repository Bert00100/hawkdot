import { POST as signupRoute } from "@/app/api/auth/signup/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicao = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });

const cadastrar = () =>
    signupRoute(
        requisicao("/api/auth/signup", {
            email: "rota-login@teste.hawkdot",
            password: "senha-forte-123",
            display_name: "Pessoa Login",
            organization_name: "Org Login",
            organization_slug: "org-login",
        }),
    );

describe("POST /api/auth/login", () => {
    it("responde 200 e grava o cookie de sessao httpOnly/Secure/SameSite", async () => {
        await cadastrar();

        const response = await loginRoute(
            requisicao("/api/auth/login", {
                email: "rota-login@teste.hawkdot",
                password: "senha-forte-123",
            }),
        );

        expect(response.status).toBe(200);

        const cookie = response.cookies.get(SESSION_COOKIE_NAME);
        expect(cookie?.value).toEqual(expect.any(String));
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.sameSite).toBe("lax");

        const body = await response.json();
        expect(body).not.toHaveProperty("token");
        expect(body.user.email).toBe("rota-login@teste.hawkdot");
    });

    it("credencial invalida responde 401 no formato de erro padrao", async () => {
        await cadastrar();

        const response = await loginRoute(
            requisicao("/api/auth/login", {
                email: "rota-login@teste.hawkdot",
                password: "senha-errada",
            }),
        );

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error.code).toBe("UNAUTHENTICATED");
    });
});
