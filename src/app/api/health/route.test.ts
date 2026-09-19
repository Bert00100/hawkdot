import { GET } from "@/app/api/health/route";
import * as healthModel from "@/models/health.model";
import prisma from "@/config/database";

// Aqui o model e mockado de proposito: o alvo do teste e a traducao
// erro -> resposta HTTP, nao o acesso a dados (isso e coberto em
// health.model.test.ts contra o banco real).
jest.mock("@/models/health.model");

const getDatabaseTimestamp = jest.mocked(healthModel.getDatabaseTimestamp);

afterAll(async () => {
    await prisma.$disconnect();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("GET /api/health", () => {
    it("responde 200 com o status do banco", async () => {
        const agora = new Date("2026-09-19T12:00:00.000Z");
        getDatabaseTimestamp.mockResolvedValue(agora);

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: "ok",
            database: "PostgreSQL",
            timestamp: agora.toISOString(),
        });
    });

    it("responde 503 no formato de erro padrao quando o banco cai", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        getDatabaseTimestamp.mockRejectedValue(
            new Error("connect ECONNREFUSED 127.0.0.1:5432"),
        );

        const response = await GET();

        expect(response.status).toBe(503);
        const body = await response.json();

        expect(body).toEqual({
            error: {
                code: "SERVICE_UNAVAILABLE",
                message: "Banco de dados indisponivel.",
            },
        });
        expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    });
});
