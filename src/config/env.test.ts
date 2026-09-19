import { parseEnv, workerDatabaseUrl } from "@/config/env";

// Base valida minima, usada como ponto de partida em cada caso.
const validEnv = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://hawkdot_api_login:senha@localhost:5432/hawkdot",
    JWT_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
    CREDENTIAL_ENCRYPTION_KEY: "0".repeat(64),
};

describe("parseEnv", () => {
    it("devolve um objeto tipado quando o ambiente e valido", () => {
        const env = parseEnv(validEnv);

        expect(env.NODE_ENV).toBe("development");
        expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    });

    it("assume development quando NODE_ENV nao e informado", () => {
        const { NODE_ENV, ...semNodeEnv } = validEnv;
        const env = parseEnv(semNodeEnv);

        expect(env.NODE_ENV).toBe("development");
    });

    it("recusa NODE_ENV fora dos valores conhecidos", () => {
        expect(() => parseEnv({ ...validEnv, NODE_ENV: "staging" })).toThrow(
            /NODE_ENV/,
        );
    });

    describe("DATABASE_URL", () => {
        it("diz qual variavel falta quando ela esta ausente", () => {
            expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(
                /DATABASE_URL/,
            );
        });

        it("recusa string vazia", () => {
            expect(() => parseEnv({ ...validEnv, DATABASE_URL: "" })).toThrow(
                /DATABASE_URL/,
            );
        });

        it("recusa connection string que nao e postgres", () => {
            expect(() =>
                parseEnv({ ...validEnv, DATABASE_URL: "mysql://localhost:3306/hawkdot" }),
            ).toThrow(/DATABASE_URL/);
        });

        it("recusa URL malformada", () => {
            expect(() =>
                parseEnv({ ...validEnv, DATABASE_URL: "postgresql://host:porta-errada/db" }),
            ).toThrow(/DATABASE_URL/);
        });

        it("aceita o esquema curto postgres://", () => {
            const env = parseEnv({
                ...validEnv,
                DATABASE_URL: "postgres://user:senha@localhost:5432/hawkdot",
            });

            expect(env.DATABASE_URL).toContain("postgres://");
        });
    });

    describe("ambiente de teste", () => {
        const testEnv = {
            ...validEnv,
            NODE_ENV: "test",
            DATABASE_URL_TEST: "postgresql://hawkdot_api_login:senha@localhost:5432/hawkdot_test",
            DATABASE_URL_TEST_ADMIN: "postgresql://adm:senha@localhost:5432/hawkdot_test",
        };

        it("aceita quando as URLs de teste estao presentes", () => {
            const env = parseEnv(testEnv);

            expect(env.DATABASE_URL_TEST).toBe(testEnv.DATABASE_URL_TEST);
            expect(env.DATABASE_URL_TEST_ADMIN).toBe(testEnv.DATABASE_URL_TEST_ADMIN);
        });

        it("exige DATABASE_URL_TEST quando NODE_ENV e test", () => {
            const { DATABASE_URL_TEST, ...semUrlDeTeste } = testEnv;

            expect(() => parseEnv(semUrlDeTeste)).toThrow(/DATABASE_URL_TEST/);
        });

        it("exige DATABASE_URL_TEST_ADMIN quando NODE_ENV e test", () => {
            const { DATABASE_URL_TEST_ADMIN, ...semUrlDeAdmin } = testEnv;

            expect(() => parseEnv(semUrlDeAdmin)).toThrow(/DATABASE_URL_TEST_ADMIN/);
        });

        it("nao exige as URLs de teste fora do ambiente de teste", () => {
            expect(() => parseEnv(validEnv)).not.toThrow();
        });
    });

    describe("workerDatabaseUrl", () => {
        it("nao e obrigatoria no schema principal -- a API sobe sem ela", () => {
            expect(() => parseEnv(validEnv)).not.toThrow();
        });

        it("devolve DATABASE_URL_WORKER_TEST em NODE_ENV=test (ja setada no .env local)", () => {
            expect(workerDatabaseUrl()).toEqual(expect.stringContaining("hawkdot_worker_login"));
        });
    });

    describe("CREDENTIAL_ENCRYPTION_KEY", () => {
        it("e obrigatoria -- nao tem valor padrao no codigo", () => {
            const { CREDENTIAL_ENCRYPTION_KEY, ...semChave } = validEnv;

            expect(() => parseEnv(semChave)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
        });

        it("recusa valor que nao tem exatamente 64 hex chars", () => {
            expect(() =>
                parseEnv({ ...validEnv, CREDENTIAL_ENCRYPTION_KEY: "curto-demais" }),
            ).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
        });

        it("aceita maiusculas tambem (hex case-insensitive)", () => {
            expect(() =>
                parseEnv({ ...validEnv, CREDENTIAL_ENCRYPTION_KEY: "A".repeat(64) }),
            ).not.toThrow();
        });
    });

    describe("JWT_SECRET", () => {
        it("e obrigatorio -- nao tem valor padrao no codigo", () => {
            const { JWT_SECRET, ...semSegredo } = validEnv;

            expect(() => parseEnv(semSegredo)).toThrow(/JWT_SECRET/);
        });

        it("recusa segredo com menos de 32 caracteres", () => {
            expect(() => parseEnv({ ...validEnv, JWT_SECRET: "curto-demais" })).toThrow(
                /JWT_SECRET/,
            );
        });
    });

    describe("JWT_TTL_SECONDS", () => {
        it("assume 3600 quando nao informado", () => {
            const env = parseEnv(validEnv);

            expect(env.JWT_TTL_SECONDS).toBe(3600);
        });

        it("aceita um valor customizado", () => {
            const env = parseEnv({ ...validEnv, JWT_TTL_SECONDS: "900" });

            expect(env.JWT_TTL_SECONDS).toBe(900);
        });

        it("recusa valor nao positivo", () => {
            expect(() => parseEnv({ ...validEnv, JWT_TTL_SECONDS: "0" })).toThrow(
                /JWT_TTL_SECONDS/,
            );
        });
    });

    describe("mensagem de erro", () => {
        it("lista todas as variaveis com problema de uma vez", () => {
            let mensagem = "";

            try {
                parseEnv({ NODE_ENV: "staging" });
            } catch (error) {
                mensagem = (error as Error).message;
            }

            expect(mensagem).toContain("NODE_ENV");
            expect(mensagem).toContain("DATABASE_URL");
        });

        it("nao vaza o valor da variavel invalida", () => {
            let mensagem = "";
            const senha = "senha-supersecreta";

            try {
                parseEnv({ ...validEnv, DATABASE_URL: `mysql://user:${senha}@localhost/db` });
            } catch (error) {
                mensagem = (error as Error).message;
            }

            expect(mensagem).not.toContain(senha);
        });
    });
});
