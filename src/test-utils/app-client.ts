import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL_TEST },
    { schema: "hawkdot" }
);

const prisma = new PrismaClient({ adapter });

export const appClient = prisma;