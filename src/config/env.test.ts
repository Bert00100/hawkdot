import { parseEnv } from "@/config/env";

// Base valida minima, usada como ponto de partida em cada caso.
const validEnv = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://hawkdot_api_login:senha@localhost:5432/hawkdot",
};

describe("parseEnv", () => {
    it("devolve um objeto tipado quando o ambiente e valido", () => {
        const env = parseEnv(validEnv);

        expect(env.NODE_ENV).toBe("development");
        expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    });

    it("assume development quando NODE_ENV nao e informado", () => {
        const env = parseEnv({ DATABASE_URL: validEnv.DATABASE_URL });

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
            NODE_ENV: "test",
            DATABASE_URL: validEnv.DATABASE_URL,
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
