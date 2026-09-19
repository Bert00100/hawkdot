import { NextResponse } from "next/server";
import { AppError, internalError, isAppError, type ErrorBody } from "./app-error";
import { translatePrismaError } from "./prisma";

// Ponte entre erro e resposta HTTP. E a unica parte de src/lib/errors/ que
// conhece NextResponse — por isso so a camada de route.ts importa daqui.

// Converte qualquer coisa lancada em um AppError. Erro que nao reconhecemos
// vira INTERNAL_ERROR generico: o detalhe fica no log, nunca na resposta.
export function toAppError(error: unknown): AppError {
    if (isAppError(error)) {
        return error;
    }

    const fromPrisma = translatePrismaError(error);
    if (fromPrisma) {
        return fromPrisma;
    }

    return internalError();
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
    const appError = toAppError(error);

    // 5xx e sempre bug nosso: registrar com o erro original inteiro.
    // 4xx e o cliente errando — nao polui o log.
    if (appError.status >= 500) {
        console.error("[hawkdot] erro nao tratado:", error);
    }

    return NextResponse.json(appError.toBody(), { status: appError.status });
}

// Acucar para o caminho feliz, para as rotas ficarem simetricas:
//   return okResponse(dados)           -> 200
//   return okResponse(dados, 201)      -> 201
export function okResponse<T>(data: T, status = 200): NextResponse<T> {
    return NextResponse.json(data, { status });
}

// Envolve o corpo de um route handler: chama o controller e, se ele lancar,
// devolve a resposta de erro no formato padrao.
//
//   export const GET = handleRoute(async () => okResponse(await listar()));
export function handleRoute<Args extends unknown[]>(
    handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
    return async (...args: Args) => {
        try {
            return await handler(...args);
        } catch (error) {
            return errorResponse(error);
        }
    };
}
