import { z } from "zod";

// Primitivas de validacao reaproveitaveis. Cada uma espelha um CHECK constraint
// do schema SQL — a regra do banco continua valendo como ultima linha de
// defesa, mas quem recusa a entrada primeiro (com mensagem legivel) e isto aqui.
//
// Ao criar uma primitiva nova, cite o constraint correspondente no comentario,
// para que uma mudanca no schema saiba onde bater.

export const uuid = z.uuid("Informe um identificador valido.");

// users_email_not_blank + UNIQUE(email)
// A normalizacao vem antes da validacao: " Felipe@Exemplo.COM " e um e-mail
// valido digitado com desleixo, nao uma entrada invalida.
export const email = z
    .string()
    .transform((valor) => valor.trim().toLowerCase())
    .pipe(
        z
            .email("Informe um e-mail valido.")
            .max(255, "O e-mail deve ter no maximo 255 caracteres."),
    );

// organizations_slug_format: ^[a-z0-9]+(?:-[a-z0-9]+)*$
export const slug = z
    .string()
    .min(1, "O slug e obrigatorio.")
    .max(63, "O slug deve ter no maximo 63 caracteres.")
    .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "O slug deve conter apenas letras minusculas, numeros e hifens, sem hifen no inicio ou no fim.",
    );

// Campos *_not_blank: o Postgres compara com btrim(), entao o trim vem antes.
export const nomeObrigatorio = (rotulo: string, max = 255) =>
    z
        .string()
        .transform((valor) => valor.trim())
        .pipe(
            z
                .string()
                .min(1, `${rotulo} e obrigatorio.`)
                .max(max, `${rotulo} deve ter no maximo ${max} caracteres.`),
        );

// domain_fqdn_format — mesmo padrao do CHECK, com o limite de 253 caracteres.
export const fqdn = z
    .string()
    .transform((valor) => valor.trim().toLowerCase())
    .pipe(
        z
            .string()
            .max(253, "O dominio deve ter no maximo 253 caracteres.")
            .regex(
                /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
                "Informe um dominio valido (ex.: exemplo.com.br).",
            ),
    );

// endpoint_url_http / http_monitor_url: ^https?://
export const httpUrl = z
    .string()
    .trim()
    .regex(/^https?:\/\//i, "A URL deve comecar com http:// ou https://.")
    .refine(
        (valor) => {
            try {
                new URL(valor);
                return true;
            } catch {
                return false;
            }
        },
        { message: "Informe uma URL valida." },
    );

// *_port: BETWEEN 1 AND 65535
export const porta = z.coerce
    .number()
    .int("A porta deve ser um numero inteiro.")
    .min(1, "A porta deve estar entre 1 e 65535.")
    .max(65535, "A porta deve estar entre 1 e 65535.");

// monitors_failure_threshold / monitors_recovery_threshold: BETWEEN 1 AND 20
export const threshold = z.coerce
    .number()
    .int("O limite deve ser um numero inteiro.")
    .min(1, "O limite deve estar entre 1 e 20.")
    .max(20, "O limite deve estar entre 1 e 20.");

export const percentual = z.coerce
    .number()
    .min(0, "O percentual deve estar entre 0 e 100.")
    .max(100, "O percentual deve estar entre 0 e 100.");

// http_monitor_status_range: BETWEEN 100 AND 599
export const statusHttp = z.coerce
    .number()
    .int("O status HTTP deve ser um numero inteiro.")
    .min(100, "O status HTTP deve estar entre 100 e 599.")
    .max(599, "O status HTTP deve estar entre 100 e 599.");

// monitors_interval_or_continuous: no modo 'interval', >= 10 segundos.
export const intervaloSegundos = z.coerce
    .number()
    .int("O intervalo deve ser um numero inteiro de segundos.")
    .min(10, "O intervalo minimo e de 10 segundos.");

// Papeis e status vindos dos ENUMs do banco.
export const papel = z.enum(["owner", "admin", "operator", "viewer"]);

// Paginacao padrao das listagens (query string, por isso o coerce).
export const paginacao = z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export type Paginacao = z.infer<typeof paginacao>;

// *_resources.address (tipo inet do Postgres, aceita IPv4 e IPv6).
export const ipAddress = z.union([z.ipv4(), z.ipv6()], {
    error: "Informe um endereco IPv4 ou IPv6 valido.",
});
