import { POST } from "@/app/api/resources/domains/route";
import { GET, PATCH, DELETE } from "@/app/api/resources/domains/[id]/route";
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

const ctxPara = (id: string) => ({ params: Promise.resolve({ id }) });

describe("rotas de recursos de dominio", () => {
    it("POST cria, GET le, PATCH atualiza, DELETE remove -- fluxo completo via HTTP", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });
        const cookie = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

        const criarResp = await POST(
            new Request("http://localhost/api/resources/domains", {
                method: "POST",
                headers: cookie,
                body: JSON.stringify({ display_name: "Site", fqdn: "rota-teste.com" }),
            }),
        );
        expect(criarResp.status).toBe(201);
        const criado = await criarResp.json();

        const lerResp = await GET(
            new Request("http://localhost/api/resources/domains/x", { headers: cookie }),
            ctxPara(criado.id),
        );
        expect(lerResp.status).toBe(200);

        const atualizarResp = await PATCH(
            new Request("http://localhost/api/resources/domains/x", {
                method: "PATCH",
                headers: cookie,
                body: JSON.stringify({ display_name: "Site Renomeado" }),
            }),
            ctxPara(criado.id),
        );
        expect(atualizarResp.status).toBe(200);
        expect((await atualizarResp.json()).display_name).toBe("Site Renomeado");

        const removerResp = await DELETE(
            new Request("http://localhost/api/resources/domains/x", { method: "DELETE", headers: cookie }),
            ctxPara(criado.id),
        );
        expect(removerResp.status).toBe(200);
    });

    it("FQDN invalido retorna 400 antes de tocar o banco", async () => {
        const { user, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await POST(
            new Request("http://localhost/api/resources/domains", {
                method: "POST",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
                body: JSON.stringify({ display_name: "Site", fqdn: "nao e valido" }),
            }),
        );

        expect(response.status).toBe(400);
    });
});
