import { z } from "zod";

// Unico ponto do codigo que le process.env. O resto da aplicacao importa o
// objeto `env` daqui, ja validado e tipado.
//
// A validacao roda na importacao deste modulo (ou seja, no boot), para que uma
// variavel ausente ou malformada quebre com mensagem clara em vez de virar um
// erro de conexao disfarcado na primeira query.

// Aceita apenas connection string de Postgres e exige que ela seja parseavel.
// `new URL()` e o que pega erros como `:porta-errada`, que passariam num regex.
const postgresUrl = z
    .string()
    .min(1)
    .refine(
        (value) => {
            try {
                const { protocol } = new URL(value);
                return protocol === "postgresql:" || protocol === "postgres:";
            } catch {
                return false;
            }
        },
        { message: "precisa ser uma connection string postgresql:// ou postgres:// valida" },
    );

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

        DATABASE_URL: postgresUrl,

        // Só usadas pela suite de testes (src/test-utils/). Opcionais aqui e
        // exigidas no superRefine abaixo quando NODE_ENV === 'test'.
        DATABASE_URL_TEST: postgresUrl.optional(),
        DATABASE_URL_TEST_ADMIN: postgresUrl.optional(),

        // M3 - Autenticacao (#15): segredo de assinatura do JWT de sessao.
        // Sem default no codigo de proposito -- se faltar, o boot falha
        // explicitamente em vez de assinar token com segredo previsivel.
        JWT_SECRET: z.string().min(32, "precisa ter ao menos 32 caracteres"),
        // TTL curto: sem tabela de sessions, nao ha revogacao imediata.
        JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

        // Preparada para a M7. Continua opcional enquanto a feature nao
        // existe; quando a M7 chegar, move-se para obrigatoria no ambiente
        // correspondente.
        // M7 - Notificacoes: credenciais dos canais de entrega.
        TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    })
    .superRefine((env, ctx) => {
        if (env.NODE_ENV !== "test") return;

        for (const key of ["DATABASE_URL_TEST", "DATABASE_URL_TEST_ADMIN"] as const) {
            if (!env[key]) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "e obrigatoria quando NODE_ENV=test",
                });
            }
        }
    });

export type Env = z.infer<typeof envSchema>;

class EnvValidationError extends Error {
    constructor(issues: z.core.$ZodIssue[]) {
        // Lista todos os problemas de uma vez, para nao descobrir um por
        // execucao. Nunca inclui o valor recebido: ele costuma conter senha.
        const detalhes = issues
            .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
            .join("\n");

        super(`Variaveis de ambiente invalidas:\n${detalhes}`);
        this.name = "EnvValidationError";
    }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
    const result = envSchema.safeParse(source);

    if (!result.success) {
        throw new EnvValidationError(result.error.issues);
    }

    return result.data;
}

export const env = parseEnv(process.env);

// As URLs de teste sao opcionais no schema (so existem com NODE_ENV=test), entao
// o tipo delas e `string | undefined`. Este helper faz o estreitamento uma vez
// so, para o src/test-utils/ nao precisar de `!` em cada client.
export function testDatabaseUrls(): { app: string; admin: string } {
    const { DATABASE_URL_TEST: app, DATABASE_URL_TEST_ADMIN: admin } = env;

    if (!app || !admin) {
        throw new Error(
            "As URLs de banco de teste so estao disponiveis com NODE_ENV=test. " +
                "Rode `npm run db:test:setup` e use `npm test`.",
        );
    }

    return { app, admin };
}
