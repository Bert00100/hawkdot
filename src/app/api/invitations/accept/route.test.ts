import { POST } from "@/app/api/invitations/accept/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicao = (cookieHeader: string, body: unknown) =>
    new Request("http://localhost/api/invitations/accept", {
        method: "POST",
        headers: { cookie: cookieHeader },
        body: JSON.stringify(body),
    });

describe("POST /api/invitations/accept", () => {
    it("convidado aceita o proprio convite mesmo com a sessao apontando para outra organizacao", async () => {
        const { organization: organizacaoDoConvite } = await createFullTenant();
        const { organization: organizacaoAtivaAtual } = await createFullTenant();
        const convidado = await createUser();
        await adminClient.organization_members.create({
            data: { organization_id: organizacaoDoConvite.id, user_id: convidado.id, role: "admin", status: "invited" },
        });
        // sessao ativa aponta para uma organizacao TOTALMENTE diferente --
        // convidado nem e membro dela.
        const token = await signSessionToken({
            user_id: convidado.id,
            organization_id: organizacaoAtivaAtual.id,
        });

        const response = await POST(
            requisicao(`${SESSION_COOKIE_NAME}=${token}`, { organization_id: organizacaoDoConvite.id }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ organization_id: organizacaoDoConvite.id, role: "admin", status: "active" });
    });

    it("sem sessao, 401", async () => {
        const response = await POST(
            requisicao("", { organization_id: "00000000-0000-0000-0000-000000000000" }),
        );

        expect(response.status).toBe(401);
    });
});
