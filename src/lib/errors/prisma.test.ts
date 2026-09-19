import { translatePrismaError } from "@/lib/errors";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createOrganization, createUser } from "@/test-utils/factories";

// Estes testes provocam os erros no Postgres de verdade, em vez de montar
// objetos falsos de erro: o formato que o Prisma entrega com driver adapter nao
// e obvio (violacao de CHECK chega como P2039, nao P2010) e um mock congelaria
// uma suposicao errada.

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await adminClient.$disconnect();
});

// Executa algo que deve falhar e devolve o erro lancado.
async function capturar(operacao: () => Promise<unknown>): Promise<unknown> {
    try {
        await operacao();
    } catch (error) {
        return error;
    }

    throw new Error("A operacao deveria ter falhado, mas passou.");
}

describe("translatePrismaError", () => {
    it("devolve null para o que nao e erro conhecido do Prisma", () => {
        expect(translatePrismaError(new Error("qualquer"))).toBeNull();
        expect(translatePrismaError("uma string")).toBeNull();
        expect(translatePrismaError(undefined)).toBeNull();
    });

    describe("violacao de UNIQUE", () => {
        it("vira 409 com mensagem util, nao 500", async () => {
            await createOrganization({ slug: "org-duplicada" });

            const error = await capturar(() =>
                createOrganization({ slug: "org-duplicada" }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(409);
            expect(app?.code).toBe("CONFLICT");
            expect(app?.message).toMatch(/slug/i);
            expect(app?.details).toEqual([
                { field: "slug", message: expect.any(String) },
            ]);
        });

        it("reconhece e-mail duplicado de usuario", async () => {
            await createUser({ email: "duplicado@teste.hawkdot" });

            const error = await capturar(() =>
                createUser({ email: "duplicado@teste.hawkdot" }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(409);
            expect(app?.message).toMatch(/e-mail/i);
        });
    });

    describe("violacao de CHECK constraint", () => {
        it("vira 400 com a mensagem da regra, nao o nome do constraint", async () => {
            const error = await capturar(() =>
                createOrganization({ slug: "SLUG INVALIDO" }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(400);
            expect(app?.code).toBe("VALIDATION_ERROR");
            expect(app?.message).toMatch(/minusculas/i);
            expect(app?.details).toEqual([
                { field: "slug", message: expect.any(String) },
            ]);
        });

        it("traduz monitors_interval_or_continuous", async () => {
            const organization = await createOrganization();
            const resource = await adminClient.resources.create({
                data: {
                    organization_id: organization.id,
                    resource_type: "domain",
                    display_name: "Recurso",
                },
            });

            // O CHECK exige interval_seconds >= 10 no modo 'interval'.
            const error = await capturar(() =>
                adminClient.monitors.create({
                    data: {
                        organization_id: organization.id,
                        resource_id: resource.id,
                        monitor_type: "http",
                        name: "Monitor rapido demais",
                        interval_seconds: 1,
                    },
                }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(400);
            expect(app?.message).toMatch(/10 segundos/);
        });

        it("usa mensagem generica para CHECK ainda nao mapeado", async () => {
            const organization = await createOrganization();

            // monitors_name_not_blank nao esta no dicionario de mensagens.
            const resource = await adminClient.resources.create({
                data: {
                    organization_id: organization.id,
                    resource_type: "domain",
                    display_name: "Recurso",
                },
            });

            const error = await capturar(() =>
                adminClient.monitors.create({
                    data: {
                        organization_id: organization.id,
                        resource_id: resource.id,
                        monitor_type: "http",
                        name: "   ",
                        interval_seconds: 60,
                    },
                }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(400);
            expect(app?.message).toMatch(/regra de integridade/i);
        });
    });

    describe("violacao de FOREIGN KEY", () => {
        it("vira 400 sem revelar qual FK falhou", async () => {
            const user = await createUser();

            const error = await capturar(() =>
                adminClient.organization_members.create({
                    data: {
                        organization_id: "00000000-0000-0000-0000-000000000000",
                        user_id: user.id,
                        role: "owner",
                        status: "invited",
                    },
                }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(400);
            expect(app?.message).not.toMatch(/fkey/);
        });
    });

    describe("registro nao encontrado", () => {
        it("vira 404", async () => {
            const error = await capturar(() =>
                adminClient.organizations.update({
                    where: { id: "00000000-0000-0000-0000-000000000000" },
                    data: { name: "Novo nome" },
                }),
            );
            const app = translatePrismaError(error);

            expect(app?.status).toBe(404);
            expect(app?.code).toBe("NOT_FOUND");
        });
    });

    describe("vazamento de detalhe interno", () => {
        it("nao deixa nome de constraint, SQL nem dados da linha na resposta", async () => {
            await createOrganization({ slug: "org-vazamento" });

            const erros = [
                await capturar(() => createOrganization({ slug: "org-vazamento" })),
                await capturar(() => createOrganization({ slug: "SLUG INVALIDO" })),
            ];

            for (const error of erros) {
                const corpo = JSON.stringify(translatePrismaError(error)?.toBody());

                expect(corpo).not.toMatch(/constraint/i);
                expect(corpo).not.toMatch(/_key\b/);
                expect(corpo).not.toMatch(/Failing row/i);
                expect(corpo).not.toMatch(/INSERT|SELECT|relation/i);
                expect(corpo).not.toMatch(/prisma/i);
            }
        });
    });
});
