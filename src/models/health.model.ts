import prisma from "@/config/database";

export async function getDatabaseTimestamp(): Promise<Date> {
    const result = await prisma.$queryRaw<{ now: Date }[]> `SELECT NOW()`;
    return result[0].now;
}