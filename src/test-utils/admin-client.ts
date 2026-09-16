import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL_TEST_ADMIN },
    { schema: "hawkdot" }
);

const prisma = new PrismaClient({ adapter })

export const adminClient = prisma;