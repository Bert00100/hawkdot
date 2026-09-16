import { adminClient } from "./admin-client";
import { cleanDatabase } from "./cleanup";

async function insertUser() {
    try {
        await adminClient.users.create({
            data: {
                email: 'teste@hawkdot.online.teste',
                display_name: 'Teste Felipe',
                password_hash: 'testeSenha',
                status: 'active',
                locale: 'pt-BR',
                timezone: 'America/Sao_Paulo',
            },
        })

        return {
            success: true,
        };
    } catch (error) {
        console.error("Not Iserte Data Base:", error)

        return {
            success: false,
        }
    }
}

describe('cleanDatabase', () => {
    afterAll(async () => {
        await adminClient.$disconnect()
    })

    it('remove todos os registros após rodar', async () => {
        const resultIsert = await insertUser()
        expect(resultIsert.success).toBe(true)

        const antes = await adminClient.users.count()
        expect(antes).toBeGreaterThan(0)

        await cleanDatabase()

        const depois = await adminClient.users.count()
        expect(depois).toBe(0)
    })
})