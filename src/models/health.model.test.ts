import prisma from "@/config/database";
import { getDatabaseTimestamp } from "@/models/health.model";

afterAll(async () => {
    await prisma.$disconnect()
})

describe('getDatabaseTimestamp', () => {
    it('return object Date', async () => {
        const result = await getDatabaseTimestamp()
        expect(result).toBeInstanceOf(Date)
    })
})