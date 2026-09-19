import { NextResponse } from "next/server";
import { conflict, errorResponse, handleRoute, okResponse, toAppError } from "@/lib/errors";

describe("toAppError", () => {
    it("devolve o proprio AppError sem alterar", () => {
        const original = conflict("slug em uso");

        expect(toAppError(original)).toBe(original);
    });

    it("transforma erro desconhecido em 500 generico", () => {
        const app = toAppError(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

        expect(app.status).toBe(500);
        expect(app.code).toBe("INTERNAL_ERROR");
        expect(app.message).not.toContain("ECONNREFUSED");
    });

    it("lida com coisas lancadas que nem sao Error", () => {
        expect(toAppError("ops").status).toBe(500);
        expect(toAppError(undefined).status).toBe(500);
    });
});

describe("errorResponse", () => {
    let errorLog: jest.SpyInstance;

    beforeEach(() => {
        errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        errorLog.mockRestore();
    });

    it("usa o status do AppError e o corpo padrao", async () => {
        const response = errorResponse(conflict("slug em uso"));

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: { code: "CONFLICT", message: "slug em uso" },
        });
    });

    it("responde 500 generico para erro inesperado", async () => {
        const response = errorResponse(new Error("detalhe interno do banco"));

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe("INTERNAL_ERROR");
        expect(JSON.stringify(body)).not.toContain("detalhe interno do banco");
    });

    it("registra o erro original no log apenas quando e 5xx", () => {
        errorResponse(new Error("boom"));
        expect(errorLog).toHaveBeenCalledTimes(1);

        errorResponse(conflict("slug em uso"));
        expect(errorLog).toHaveBeenCalledTimes(1);
    });
});

describe("okResponse", () => {
    it("responde 200 por padrao", async () => {
        const response = okResponse({ id: "1" });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ id: "1" });
    });

    it("aceita outro status", () => {
        expect(okResponse({ id: "1" }, 201).status).toBe(201);
    });
});

describe("handleRoute", () => {
    it("deixa passar a resposta do caminho feliz", async () => {
        const handler = handleRoute(async () => okResponse({ ok: true }));
        const response = await handler();

        expect(response.status).toBe(200);
    });

    it("converte erro lancado pelo controller em resposta padrao", async () => {
        const handler = handleRoute(async () => {
            throw conflict("slug em uso");
        });

        const response = await handler();

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: { code: "CONFLICT", message: "slug em uso" },
        });
    });

    it("repassa os argumentos do route handler", async () => {
        const handler = handleRoute(async (request: Request) =>
            okResponse({ url: request.url }),
        );

        const response = await handler(new Request("http://localhost/api/teste"));

        await expect(response.json()).resolves.toEqual({
            url: "http://localhost/api/teste",
        });
    });

    it("devolve NextResponse, nao Response cru", async () => {
        const handler = handleRoute(async () => {
            throw conflict("x");
        });

        expect(await handler()).toBeInstanceOf(NextResponse);
    });
});
