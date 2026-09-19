import { z } from "zod";
import { parseBody, parseInput, parseQuery } from "@/lib/dto";
import { dto } from "@/lib/dto";
import { errorResponse, isAppError, type AppError } from "@/lib/errors";

const organizacaoSchema = z.object({
    name: dto.nomeObrigatorio("O nome"),
    slug: dto.slug,
});

// Executa algo que deve lancar e devolve o AppError resultante.
function capturarAppError(operacao: () => unknown): AppError {
    try {
        operacao();
    } catch (error) {
        if (isAppError(error)) return error;
        throw error;
    }

    throw new Error("A validacao deveria ter falhado, mas passou.");
}

describe("parseInput", () => {
    it("devolve os dados tipados quando a entrada e valida", () => {
        const dados = parseInput(organizacaoSchema, {
            name: "  Hawkdot  ",
            slug: "hawkdot",
        });

        expect(dados).toEqual({ name: "Hawkdot", slug: "hawkdot" });
    });

    it("lanca 400 com a lista de campos com problema", () => {
        const error = capturarAppError(() =>
            parseInput(organizacaoSchema, { name: "   ", slug: "Slug Invalido" }),
        );

        expect(error.status).toBe(400);
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details?.map((d) => d.field).sort()).toEqual(["name", "slug"]);
    });

    it("acusa campo ausente", () => {
        const error = capturarAppError(() => parseInput(organizacaoSchema, {}));

        expect(error.details?.map((d) => d.field).sort()).toEqual(["name", "slug"]);
    });

    it("usa '(corpo)' quando o problema nao e de um campo especifico", () => {
        const schema = z
            .object({ min: z.number(), max: z.number() })
            .refine((v) => v.max >= v.min, { message: "max deve ser >= min" });

        const error = capturarAppError(() => parseInput(schema, { min: 10, max: 1 }));

        expect(error.details).toEqual([{ field: "(corpo)", message: "max deve ser >= min" }]);
    });

    it("recusa entrada que nem e objeto", () => {
        expect(capturarAppError(() => parseInput(organizacaoSchema, null)).status).toBe(400);
        expect(capturarAppError(() => parseInput(organizacaoSchema, "texto")).status).toBe(400);
    });

    it("produz uma resposta HTTP 400 no formato padrao de erro", async () => {
        const error = capturarAppError(() =>
            parseInput(organizacaoSchema, { name: "Ok", slug: "Invalido" }),
        );
        const response = errorResponse(error);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "VALIDATION_ERROR",
                message: "Dados invalidos.",
                details: [{ field: "slug", message: expect.any(String) }],
            },
        });
    });
});

describe("parseBody", () => {
    const requisicao = (body: string) =>
        new Request("http://localhost/api/organizations", { method: "POST", body });

    it("valida o corpo JSON", async () => {
        const request = requisicao(JSON.stringify({ name: "Hawkdot", slug: "hawkdot" }));

        await expect(parseBody(organizacaoSchema, request)).resolves.toEqual({
            name: "Hawkdot",
            slug: "hawkdot",
        });
    });

    it("responde 400 para JSON malformado, nao 500", async () => {
        await expect(parseBody(organizacaoSchema, requisicao("{ isso nao e json"))).rejects.toMatchObject({
            status: 400,
            code: "VALIDATION_ERROR",
        });
    });

    it("responde 400 para corpo vazio", async () => {
        const request = new Request("http://localhost/api/organizations", { method: "POST" });

        await expect(parseBody(organizacaoSchema, request)).rejects.toMatchObject({ status: 400 });
    });
});

describe("parseQuery", () => {
    const schema = dto.paginacao;

    it("aplica os padroes quando a query esta vazia", () => {
        const request = new Request("http://localhost/api/monitors");

        expect(parseQuery(schema, request)).toEqual({ page: 1, per_page: 20 });
    });

    it("converte os valores de string para numero", () => {
        const request = new Request("http://localhost/api/monitors?page=3&per_page=50");

        expect(parseQuery(schema, request)).toEqual({ page: 3, per_page: 50 });
    });

    it("recusa valores fora do limite", () => {
        const request = new Request("http://localhost/api/monitors?per_page=500");

        expect(capturarAppError(() => parseQuery(schema, request)).status).toBe(400);
    });
});
