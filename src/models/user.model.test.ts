import { findLoginCredentials } from "@/models/user.model";
import prisma from "@/config/database";
import { appClient } from "@/test-utils/app-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
    await appClient.$disconnect();
});

describe("findLoginCredentials", () => {
    it("devolve id, hash e status pelo e-mail, sem contexto de tenant", async () => {
        const user = await createUser({
            email: "login@teste.hawkdot",
            password_hash: "hash-x",
        });

        await expect(findLoginCredentials("login@teste.hawkdot")).resolves.toEqual({
            id: user.id,
            password_hash: "hash-x",
            status: "active",
        });
    });

    it("devolve null para e-mail que nao existe", async () => {
        await expect(findLoginCredentials("nao-existe@teste.hawkdot")).resolves.toBeNull();
    });

    it("a policy normal continua bloqueando SELECT direto na tabela users pelo role da API", async () => {
        const user = await createUser({ email: "login2@teste.hawkdot" });

        const direto = await appClient.users.findUnique({ where: { id: user.id } });

        expect(direto).toBeNull();
    });
});
