import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { testDatabaseUrls } from "@/config/env";

const adapter = new PrismaPg(
    { connectionString: testDatabaseUrls().app, max: 3 },
    { schema: "hawkdot" }
);

const prisma = new PrismaClient({ adapter });

export const appClient = prisma;