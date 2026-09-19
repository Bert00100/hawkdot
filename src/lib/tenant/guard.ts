import { env } from "@/config/env";

// O default export de src/config/database.ts e este client "guardado": ele
// nunca deve ser usado para operacao de modelo (findMany, create, ...)
// diretamente. Quem precisa ler/escrever dados de tenant usa o `tx` que
// withTenant() entrega dentro do callback -- esse `tx` vem de um client base
// separado (basePrisma, tambem exportado por config/database.ts), sem esta
// extensao, entao roda normalmente.
//
// Ou seja: nao ha "modo" nem estado por request para checar -- o proprio
// objeto client usado ja denuncia o erro. Isso evita depender de
// AsyncLocalStorage atravessando o agendamento de promises lazy do Prisma
// (testado: o contexto se perdia entre o $transaction e o callback).
export class MissingTenantContextError extends Error {
    constructor(model: string, operation: string) {
        super(
            `Query de negocio "${model}.${operation}" executada fora de withTenant(). ` +
                "Toda leitura/escrita de dados de tenant precisa usar o client `tx` " +
                "recebido dentro do callback de withTenant() -- nunca o `prisma` " +
                "importado direto de @/config/database, que so serve para $queryRaw/" +
                "$executeRaw (health check, lookup de login) e para withTenant abrir a " +
                "transacao. Chamar uma operacao de modelo nele direto rodaria sem o " +
                "set_config, e o RLS filtraria tudo silenciosamente.",
        );
        this.name = "MissingTenantContextError";
    }
}

// Em desenvolvimento e teste, lanca erro -- o objetivo e estourar o bug na
// cara de quem escreveu o codigo, nao deixar `[]` silencioso. Em producao so
// loga: o RLS ja impede o vazamento de dados de qualquer forma, e preferimos
// nao derrubar a aplicacao inteira por causa de um guard de desenvolvimento.
export const tenantGuardExtension = {
    name: "tenant-context-guard",
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }: {
                model?: string;
                operation: string;
                args: unknown;
                query: (args: unknown) => Promise<unknown>;
            }) {
                const error = new MissingTenantContextError(model ?? "(modelo)", operation);

                if (env.NODE_ENV === "production") {
                    console.error(`[hawkdot] ${error.message}`);
                    return query(args);
                }

                throw error;
            },
        },
    },
};
