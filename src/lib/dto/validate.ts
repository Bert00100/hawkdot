import { z } from "zod";
import { validationError, type ErrorDetail } from "@/lib/errors";

// Ponte entre Zod e o padrao de erro da aplicacao: entrada invalida vira um
// AppError VALIDATION_ERROR (400) com a lista de campos com problema, no mesmo
// corpo de erro de todas as outras rotas.

function toDetails(error: z.ZodError): ErrorDetail[] {
    return error.issues.map((issue) => ({
        // Caminho vazio significa problema no objeto inteiro (ex.: um refine
        // que cruza dois campos).
        field: issue.path.length ? issue.path.join(".") : "(corpo)",
        message: issue.message,
    }));
}

// Valida um objeto ja em memoria. E a funcao usada pelos testes e por qualquer
// validacao que nao venha direto do Request.
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
    const result = schema.safeParse(input);

    if (!result.success) {
        throw validationError("Dados invalidos.", toDetails(result.error));
    }

    return result.data;
}

// Le e valida o corpo JSON de um Request. Corpo ausente ou malformado tambem e
// 400 — nunca 500.
export async function parseBody<S extends z.ZodType>(
    schema: S,
    request: Request,
): Promise<z.infer<S>> {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        throw validationError("Corpo da requisicao ausente ou nao e um JSON valido.");
    }

    return parseInput(schema, body);
}

// Valida a query string. Os valores chegam sempre como string, por isso as
// primitivas numericas de common.ts usam `z.coerce`.
export function parseQuery<S extends z.ZodType>(
    schema: S,
    request: Request,
): z.infer<S> {
    const { searchParams } = new URL(request.url);

    return parseInput(schema, Object.fromEntries(searchParams));
}
