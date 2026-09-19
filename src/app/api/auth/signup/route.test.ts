import { POST } from "@/app/api/auth/signup/route";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const requisicao = (body: unknown) =>
    new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
    });

describe("POST /api/auth/signup", () => {
    it("cria a conta e responde 201 com usuario e organizacao", async () => {
        const response = await POST(
            requisicao({
                email: "rota@teste.hawkdot",
                password: "senha-forte-123",
                display_name: "Pessoa da Rota",
                organization_name: "Org da Rota",
                organization_slug: "org-da-rota",
            }),
        );

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.user.email).toBe("rota@teste.hawkdot");
        expect(body.organization.slug).toBe("org-da-rota");
        expect(body.user).not.toHaveProperty("password_hash");
    });

    it("slug invalido retorna 400 antes de tocar o banco", async () => {
        const response = await POST(
            requisicao({
                email: "rota2@teste.hawkdot",
                password: "senha-forte-123",
                display_name: "Pessoa da Rota",
                organization_name: "Org da Rota",
                organization_slug: "Slug Invalido",
            }),
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("senha fora da politica retorna 400", async () => {
        const response = await POST(
            requisicao({
                email: "rota3@teste.hawkdot",
                password: "123",
                display_name: "Pessoa da Rota",
                organization_name: "Org da Rota",
                organization_slug: "org-da-rota-3",
            }),
        );

        expect(response.status).toBe(400);
    });
});
