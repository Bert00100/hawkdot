import { POST } from "@/app/api/monitors/route";
import { GET, PATCH, DELETE } from "@/app/api/monitors/[id]/route";
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

describe("rotas de monitores", () => {
    it("POST cria, GET le, PATCH atualiza, DELETE remove -- fluxo completo via HTTP", async () => {
        const { user, organization, resource } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });
        const cookie = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

        const criarResp = await POST(
            new Request("http://localhost/api/monitors", {
                method: "POST",
                headers: cookie,
                body: JSON.stringify({ resource_id: resource.id, monitor_type: "http", name: "Rota" }),
            }),
        );
        expect(criarResp.status).toBe(201);
        const criado = await criarResp.json();

        const lerResp = await GET(
            new Request("http://localhost/api/monitors/x", { headers: cookie }),
            ctxPara(criado.id),
        );
        expect(lerResp.status).toBe(200);

        const atualizarResp = await PATCH(
            new Request("http://localhost/api/monitors/x", {
                method: "PATCH",
                headers: cookie,
                body: JSON.stringify({ status: "paused" }),
            }),
            ctxPara(criado.id),
        );
        expect(atualizarResp.status).toBe(200);
        expect((await atualizarResp.json()).status).toBe("paused");

        const removerResp = await DELETE(
            new Request("http://localhost/api/monitors/x", { method: "DELETE", headers: cookie }),
            ctxPara(criado.id),
        );
        expect(removerResp.status).toBe(200);
    });

    it("combinacao invalida de modo/intervalo retorna 400 com mensagem explicativa", async () => {
        const { user, organization, resource } = await createFullTenant();
        const token = await signSessionToken({ user_id: user.id, organization_id: organization.id });

        const response = await POST(
            new Request("http://localhost/api/monitors", {
                method: "POST",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
                body: JSON.stringify({
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "Invalido",
                    interval_seconds: 3,
                }),
            }),
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.details?.[0]?.field).toBe("interval_seconds");
    });
});
