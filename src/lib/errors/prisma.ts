import { Prisma } from "@/generated/prisma/client";
import {
    AppError,
    conflict,
    notFound,
    validationError,
    type ErrorDetail,
} from "./app-error";

// Traduz erro do Prisma/Postgres em AppError.
//
// Os formatos abaixo foram verificados contra o banco real com o adapter
// PrismaPg — nao sao suposicoes. Em especial, violacao de CHECK chega como
// **P2039** (nao P2010), com o codigo 23505/23514 dentro de
// `meta.driverAdapterError.cause`.
//
// Nada do erro original vai para a resposta: `originalMessage` cita nome de
// constraint e `detail` chega a trazer a linha inteira que falhou, com dados do
// usuario dentro.

type DriverAdapterCause = {
    originalCode?: string;
    originalMessage?: string;
    code?: string;
    message?: string;
    constraint?: { index?: string; fields?: string[] };
    table?: string;
};

function driverCause(error: Prisma.PrismaClientKnownRequestError): DriverAdapterCause {
    const meta = error.meta as
        | { driverAdapterError?: { cause?: DriverAdapterCause } }
        | undefined;

    return meta?.driverAdapterError?.cause ?? {};
}

// Nome do indice unico -> campo e mensagem para o usuario.
const UNIQUE_MESSAGES: Record<string, { field: string; message: string }> = {
    organizations_slug_key: {
        field: "slug",
        message: "Ja existe uma organizacao com esse slug.",
    },
    users_email_key: {
        field: "email",
        message: "Ja existe uma conta com esse e-mail.",
    },
    // PK composta (organization_id, user_id) -- nao uma UNIQUE nomeada.
    // Verificado contra o banco real: a entrada anterior deste dicionario
    // citava um nome de constraint que nao existe (organization_members_
    // organization_id_user_id_key) e nunca teria batido.
    organization_members_pkey: {
        field: "user_id",
        message: "Esse usuario ja e membro (ou ja foi convidado) para esta organizacao.",
    },
};

// Nome do CHECK constraint -> mensagem para o usuario. O nome nunca sai na
// resposta; serve so para escolher a frase certa aqui.
const CHECK_MESSAGES: Record<string, { field?: string; message: string }> = {
    organizations_slug_format: {
        field: "slug",
        message: "O slug deve conter apenas letras minusculas, numeros e hifens.",
    },
    monitors_interval_or_continuous: {
        field: "interval_seconds",
        message:
            "No modo 'interval' o intervalo deve ser de ao menos 10 segundos; " +
            "no modo 'continuous' ele deve ficar vazio.",
    },
    monitors_continuous_agent_only: {
        field: "execution_mode",
        message: "O modo 'continuous' so vale para monitores do tipo 'server_agent'.",
    },
    monitors_failure_threshold: {
        field: "failure_threshold",
        message: "O limite de falhas deve estar entre 1 e 20.",
    },
    domain_fqdn_format: {
        field: "fqdn",
        message: "Informe um dominio valido.",
    },
    endpoint_url_http: {
        field: "url",
        message: "A URL deve comecar com http:// ou https://.",
    },
    http_monitor_url: {
        field: "url",
        message: "A URL deve comecar com http:// ou https://.",
    },
    credentials_one_secret_source: {
        message: "Informe exatamente uma origem de segredo para a credencial.",
    },
    active_member_has_joined_at: {
        field: "joined_at",
        message: "Um membro ativo precisa ter data de entrada.",
    },
};

// `new row for relation "x" violates check constraint "nome_do_check"`
function extractConstraintName(message: string | undefined): string | undefined {
    return message?.match(/violates check constraint "([^"]+)"/)?.[1];
}

export function translatePrismaError(error: unknown): AppError | null {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return null;
    }

    const cause = driverCause(error);

    switch (error.code) {
        // Violacao de UNIQUE — 409, nunca 500.
        case "P2002": {
            const index = cause.constraint?.index;
            const known = index ? UNIQUE_MESSAGES[index] : undefined;

            if (known) {
                return new AppError("CONFLICT", known.message, [
                    { field: known.field, message: known.message },
                ]);
            }

            return conflict("Ja existe um registro com esses dados.");
        }

        // Violacao de FOREIGN KEY: aponta para um registro que nao existe
        // (ou que o RLS nao deixa enxergar, o que da no mesmo para o cliente).
        case "P2003":
            return validationError(
                "Um dos registros referenciados nao existe ou nao esta disponivel.",
            );

        // Registro exigido pela operacao nao encontrado.
        case "P2025":
            return notFound("Registro");

        // Valor longo demais para a coluna.
        case "P2000":
            return validationError("Um dos campos excede o tamanho maximo permitido.");

        // Erro cru do banco vindo do driver adapter. E aqui que caem os CHECKs.
        case "P2039":
        case "P2010": {
            const pgCode = cause.code ?? cause.originalCode;

            if (pgCode === "23514") {
                const constraintName = extractConstraintName(
                    cause.originalMessage ?? cause.message,
                );
                const known = constraintName ? CHECK_MESSAGES[constraintName] : undefined;

                if (known) {
                    const details: ErrorDetail[] | undefined = known.field
                        ? [{ field: known.field, message: known.message }]
                        : undefined;

                    return validationError(known.message, details);
                }

                return validationError(
                    "Os dados enviados violam uma regra de integridade do sistema.",
                );
            }

            // 23505 e 23503 crus (fora dos codigos mapeados acima).
            if (pgCode === "23505") {
                return conflict("Ja existe um registro com esses dados.");
            }
            if (pgCode === "23503") {
                return validationError(
                    "Um dos registros referenciados nao existe ou nao esta disponivel.",
                );
            }

            return null;
        }

        default:
            return null;
    }
}
