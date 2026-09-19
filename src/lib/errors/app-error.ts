// Erro de aplicacao: a unica forma de erro que as camadas de controller e model
// devem lancar deliberadamente. Carrega o codigo, a mensagem que o cliente pode
// ver e o status HTTP correspondente — mas nao conhece NextResponse: quem
// transforma isso em resposta e a camada HTTP (src/lib/errors/http.ts).

export const ERROR_STATUS = {
    VALIDATION_ERROR: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

// Detalhe por campo, usado principalmente pela validacao de entrada (Zod).
export type ErrorDetail = {
    field: string;
    message: string;
};

export type ErrorBody = {
    error: {
        code: ErrorCode;
        message: string;
        details?: ErrorDetail[];
    };
};

export class AppError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: ErrorDetail[];

    constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = ERROR_STATUS[code];
        this.details = details;
    }

    // Corpo da resposta. Repare que nada alem de code/message/details sai daqui:
    // stack, causa e mensagem original do banco ficam para o log.
    toBody(): ErrorBody {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.details?.length ? { details: this.details } : {}),
            },
        };
    }
}

export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}

// Fabricas — preferir estas a `new AppError(...)` no codigo de feature.

export function validationError(
    message = "Dados invalidos.",
    details?: ErrorDetail[],
): AppError {
    return new AppError("VALIDATION_ERROR", message, details);
}

export function unauthenticated(message = "Autenticacao necessaria."): AppError {
    return new AppError("UNAUTHENTICATED", message);
}

export function forbidden(
    message = "Voce nao tem permissao para esta acao.",
): AppError {
    return new AppError("FORBIDDEN", message);
}

export function notFound(resource = "Recurso"): AppError {
    return new AppError("NOT_FOUND", `${resource} nao encontrado.`);
}

export function conflict(message = "Conflito com um registro existente."): AppError {
    return new AppError("CONFLICT", message);
}

export function internalError(
    message = "Erro interno. Tente novamente em instantes.",
): AppError {
    return new AppError("INTERNAL_ERROR", message);
}

// Dependencia externa fora do ar (hoje: o banco, no /api/health).
export function serviceUnavailable(
    message = "Servico temporariamente indisponivel.",
): AppError {
    return new AppError("SERVICE_UNAVAILABLE", message);
}
