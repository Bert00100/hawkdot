import { getSession, withSession } from "@/lib/auth/require-session";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant } from "@/test-utils/factories";

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicaoCom = (cookieHeader?: string) =>
    new Request("http://localhost/api/qualquer", {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

describe("getSession", () => {
    it("extrai userId e organizationId de um cookie de sessao valido", async () => {
        const token = await signSessionToken({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        });

        const session = await getSession(requisicaoCom(`${SESSION_COOKIE_NAME}=${token}`));

        expect(session).toEqual({
            userId: "11111111-1111-1111-1111-111111111111",
            organizationId: "22222222-2222-2222-2222-222222222222",
        });
    });

    it("le o cookie certo mesmo com outros cookies presentes", async () => {
        const token = await signSessionToken({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        });

        const session = await getSession(
            requisicaoCom(`theme=dark; ${SESSION_COOKIE_NAME}=${token}; outro=valor`),
        );

        expect(session.userId).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("sem cookie nenhum, lanca 401 sem tocar o banco", async () => {
        const erro = await getSession(requisicaoCom()).catch((e) => e);

        expect(erro).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    });

    it("cookie de sessao presente mas invalido, lanca 401", async () => {
        const erro = await getSession(
            requisicaoCom(`${SESSION_COOKIE_NAME}=token-invalido`),
        ).catch((e) => e);

        expect(erro).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    });
});

describe("withSession", () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    it("abre a transacao de tenant com o mesmo userId/organizationId da sessao", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const resultado = await withSession(
            requisicaoCom(`${SESSION_COOKIE_NAME}=${token}`),
            async (tx, session) => {
                expect(session).toEqual({ userId: user.id, organizationId: organization.id });
                return tx.organizations.findUnique({ where: { id: organization.id } });
            },
        );

        expect(resultado?.id).toBe(organization.id);
    });

    it("sem sessao valida, lanca 401 e nunca chama o callback (nem abre transacao)", async () => {
        const callback = jest.fn();

        const erro = await withSession(requisicaoCom(), callback).catch((e) => e);

        expect(erro).toMatchObject({ status: 401 });
        expect(callback).not.toHaveBeenCalled();
    });
});
