import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, testDatabaseUrls } from "@/config/env";
import { tenantGuardExtension } from "@/lib/tenant/guard";

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

// Client sem a guarda de contexto -- e o unico usado para abrir a transacao
// em withTenant() (src/lib/tenant/with-tenant.ts). O `tx` que o callback
// recebe vem dele, entao roda operacoes de modelo normalmente depois do
// set_config.
export const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

// Default export: client "guardado" (ver src/lib/tenant/guard.ts e #10).
// Serve para $queryRaw/$executeRaw (health check, lookup de login da M3) e
// para nada mais -- qualquer operacao de modelo chamada nele direto lanca
// MissingTenantContextError em vez de rodar sem contexto de tenant.
const prisma = basePrisma.$extends(tenantGuardExtension);

export default prisma;
