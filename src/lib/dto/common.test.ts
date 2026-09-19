import { dto, parseInput } from "@/lib/dto";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";

const aceita = (schema: Parameters<typeof parseInput>[0], valor: unknown) => {
    expect(() => parseInput(schema, valor)).not.toThrow();
};

const recusa = (schema: Parameters<typeof parseInput>[0], valor: unknown) => {
    expect(() => parseInput(schema, valor)).toThrow();
};

describe("primitivas de validacao", () => {
    describe("slug", () => {
        it.each(["hawkdot", "minha-org", "org-123", "a1"])("aceita %p", (valor) => {
            aceita(dto.slug, valor);
        });

        it.each(["", "Org", "org_teste", "-org", "org-", "org--teste", "org teste", "acentuação"])(
            "recusa %p",
            (valor) => {
                recusa(dto.slug, valor);
            },
        );
    });

    describe("fqdn", () => {
        it.each(["exemplo.com", "sub.exemplo.com.br", "a-b.exemplo.io"])("aceita %p", (valor) => {
            aceita(dto.fqdn, valor);
        });

        it.each(["", "semponto", "-inicio.com", "exemplo..com", "http://exemplo.com"])(
            "recusa %p",
            (valor) => {
                recusa(dto.fqdn, valor);
            },
        );

        it("normaliza para minusculas e sem espacos", () => {
            expect(parseInput(dto.fqdn, "  Exemplo.COM  ")).toBe("exemplo.com");
        });
    });

    describe("httpUrl", () => {
        it.each(["http://exemplo.com", "https://exemplo.com/health?x=1"])("aceita %p", (valor) => {
            aceita(dto.httpUrl, valor);
        });

        it.each(["", "exemplo.com", "ftp://exemplo.com", "https://"])("recusa %p", (valor) => {
            recusa(dto.httpUrl, valor);
        });
    });

    describe("email", () => {
        it("normaliza espacos e caixa alta", () => {
            expect(parseInput(dto.email, "  Felipe@Exemplo.COM ")).toBe("felipe@exemplo.com");
        });

        it.each(["", "sem-arroba", "a@b"])("recusa %p", (valor) => {
            recusa(dto.email, valor);
        });
    });

    describe("faixas numericas", () => {
        it("porta aceita 1..65535 e recusa fora disso", () => {
            aceita(dto.porta, 1);
            aceita(dto.porta, 65535);
            recusa(dto.porta, 0);
            recusa(dto.porta, 65536);
            recusa(dto.porta, 443.5);
        });

        it("threshold aceita 1..20", () => {
            aceita(dto.threshold, 1);
            aceita(dto.threshold, 20);
            recusa(dto.threshold, 0);
            recusa(dto.threshold, 21);
        });

        it("statusHttp aceita 100..599", () => {
            aceita(dto.statusHttp, 200);
            recusa(dto.statusHttp, 99);
            recusa(dto.statusHttp, 600);
        });

        it("intervaloSegundos exige o minimo de 10 segundos do CHECK", () => {
            aceita(dto.intervaloSegundos, 10);
            recusa(dto.intervaloSegundos, 9);
        });
    });

    describe("nomeObrigatorio", () => {
        const nome = dto.nomeObrigatorio("O nome");

        it("remove espacos das pontas", () => {
            expect(parseInput(nome, "  Monitor  ")).toBe("Monitor");
        });

        it("recusa string so de espacos, como o CHECK btrim(...) <> ''", () => {
            recusa(nome, "   ");
        });
    });
});

// O ponto da issue #7: a validacao da aplicacao e a primeira linha de defesa, e
// o CHECK do banco continua sendo a ultima. Os dois precisam concordar — se o
// Zod aceitasse algo que o Postgres recusa, o usuario tomaria um 500.
describe("alinhamento com os CHECK constraints do banco", () => {
    beforeEach(async () => {
        await cleanDatabase();
    });

    afterAll(async () => {
        await cleanDatabase();
        await adminClient.$disconnect();
    });

    const tentarInserirSlug = async (slug: string) => {
        try {
            await adminClient.organizations.create({ data: { name: "Org", slug } });
            return "aceito" as const;
        } catch {
            return "recusado" as const;
        }
    };

    const zodAvalia = (slug: string) => {
        try {
            parseInput(dto.slug, slug);
            return "aceito" as const;
        } catch {
            return "recusado" as const;
        }
    };

    it.each([
        "hawkdot",
        "minha-org",
        "org-123",
        "Org",
        "org_teste",
        "-org",
        "org-",
        "org teste",
        "",
    ])("Zod e o CHECK organizations_slug_format concordam sobre %p", async (slug) => {
        expect(zodAvalia(slug)).toBe(await tentarInserirSlug(slug));
    });
});
