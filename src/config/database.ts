import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, testDatabaseUrls } from "@/config/env";

// Em teste, o singleton aponta para o banco isolado hawkdot_test, com o
// mesmo role restrito por RLS (hawkdot_api_login) que a producao usa -- assim
// o codigo de aplicacao (withTenant, models) roda contra RLS de verdade nos
// testes, sem precisar de um client de teste paralelo so para isso.
const connectionString =
    env.NODE_ENV === "test" ? testDatabaseUrls().app : env.DATABASE_URL;

const poolConfig =
    env.NODE_ENV === "test" ? { connectionString, max: 3 } : { connectionString };

const adapter = new PrismaPg(poolConfig, { schema: "hawkdot" });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
