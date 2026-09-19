import { POST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

describe("POST /api/auth/logout", () => {
    it("responde 200 e limpa o cookie de sessao", async () => {
        const response = await POST();

        expect(response.status).toBe(200);

        const cookie = response.cookies.get(SESSION_COOKIE_NAME);
        // "limpar" um cookie e um Set-Cookie com valor vazio e expiracao no
        // passado -- e assim que NextResponse.cookies.delete() funciona.
        expect(cookie?.value).toBe("");
    });

    it("e idempotente -- funciona mesmo sem cookie de sessao presente", async () => {
        const response = await POST();

        expect(response.status).toBe(200);
    });
});
