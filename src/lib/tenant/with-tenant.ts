import { Prisma } from "@/generated/prisma/client";
import prisma from "@/config/database";

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

export type TenantClient = Omit<
    Prisma.TransactionClient,
    "$transaction" | "$connect" | "$disconnect" | "$extends"
>;

export type TenantContext = {
    userId: string;
    // Ausente para operacoes que so precisam saber quem e o usuario (ex.:
    // listar as organizacoes de que ele participa, no /me).
    organizationId?: string;
};

// Unico ponto de entrada para query de negocio. O client que o callback
// recebe SO existe dentro desta transacao, com o contexto ja definido -- por
// isso models de recurso devem sempre receber esse client como parametro, e
// nunca importar o `prisma` singleton diretamente (exceto health.model e o
// lookup de login da M3, que rodam antes de haver contexto de usuario).
export async function withTenant<T>(
    context: TenantContext,
    callback: (tx: TenantClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('hawkdot.current_user_id', ${context.userId}, true)`;

        if (context.organizationId) {
            await tx.$executeRaw`SELECT set_config('hawkdot.current_organization_id', ${context.organizationId}, true)`;
        }

        return callback(tx);
    });
}
