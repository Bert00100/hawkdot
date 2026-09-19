import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { workerDatabaseUrl } from "@/config/env";
import { tenantGuardExtension } from "@/lib/tenant/guard";

// Conexao propria do worker -- role hawkdot_worker_login, com grants bem
// mais restritos que a API (sem DELETE em monitors, por exemplo; ver
// AGENTS.md "Worker: processo, conexao e contexto"). NUNCA compartilha
// client com src/config/database.ts.
//
// workerDatabaseUrl() lanca se a variavel de ambiente faltar -- entao so
// importar este modulo sem a variavel setada ja falha explicito, o que e
// desejado: nenhum codigo da API deveria importar isto.
const adapter = new PrismaPg({ connectionString: workerDatabaseUrl(), max: 3 }, { schema: "hawkdot" });

// Client sem a guarda de contexto -- e o unico usado para abrir a transacao
// em withWorkerTenant() (mesmo raciocinio de src/config/database.ts/
// src/lib/tenant/with-tenant.ts para a API).
export const workerBasePrisma = new PrismaClient({ adapter });

// Client guardado (#10, reaproveitado aqui): qualquer operacao de modelo
// chamada nele direto lanca MissingTenantContextError em vez de rodar sem
// contexto de organizacao.
const workerPrisma = workerBasePrisma.$extends(tenantGuardExtension);

export default workerPrisma;
