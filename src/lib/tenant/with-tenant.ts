import { basePrisma } from "@/config/database";

// Toda tabela de negocio tem policies de RLS que filtram por
// hawkdot_private.current_organization_id(), que le
// current_setting('hawkdot.current_organization_id', true). O role da API
// (hawkdot_app) nao tem BYPASSRLS: uma query sem esse contexto nao da erro,
// volta ZERO linhas silenciosamente.
//
// O terceiro argumento `true` de set_config limita o valor a transacao atual
// -- por isso os set_config so podem rodar dentro de uma transacao Prisma
// ($transaction interativo), nunca numa conexao solta do pool. Se fosse
// `false`, o valor vazaria para a proxima request que reusasse a mesma
// conexao: um tenant leria dados de outro.
//
// withTenant abre a transacao a partir de `basePrisma` (sem a guarda de
// contexto do #10) -- o `tx` que o callback recebe roda normalmente depois do
// set_config. Ver src/lib/tenant/guard.ts para o porque de nao usar o
// `prisma` guardado (default export de config/database) aqui.
export type TenantClient = Parameters<Parameters<typeof basePrisma.$transaction>[0]>[0];

export type TenantContext = {
    userId: string;
    // Ausente para operacoes que so precisam saber quem e o usuario (ex.:
    // listar as organizacoes de que ele participa, no /me).
    organizationId?: string;
};

// Unico ponto de entrada para query de negocio. O client que o callback
// recebe SO existe dentro desta transacao, com o contexto ja definido -- por
// isso models de recurso devem sempre receber esse client como parametro, e
// nunca importar `prisma` (default export guardado) para operacao de
// modelo -- so health.model e o lookup de login da M3 usam esse default
// export, e so para $queryRaw/$executeRaw.
export async function withTenant<T>(
    context: TenantContext,
    callback: (tx: TenantClient) => Promise<T>,
): Promise<T> {
    return basePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('hawkdot.current_user_id', ${context.userId}, true)`;

        if (context.organizationId) {
            await tx.$executeRaw`SELECT set_config('hawkdot.current_organization_id', ${context.organizationId}, true)`;
        }

        return callback(tx);
    });
}
