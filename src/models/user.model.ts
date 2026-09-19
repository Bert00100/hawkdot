import prisma from "@/config/database";
import type { TenantClient } from "@/lib/tenant/with-tenant";

export type LoginCredentials = {
    id: string;
    password_hash: string | null;
    status: "active" | "disabled";
};

// Roda ANTES de existir contexto de tenant/usuario (e o proprio ponto do
// login: ainda nao se sabe quem e o usuario). users_self_select bloquearia
// uma busca por e-mail, entao isto chama a funcao SECURITY DEFINER
// hawkdot_private.find_login_credentials (issue #12), que devolve so o
// minimo necessario para autenticar -- nunca o registro completo do usuario.
//
// E uma das duas excecoes documentadas em AGENTS.md ao "nenhuma query roda
// fora do withTenant": usa $queryRaw no client guardado (src/lib/tenant/guard.ts),
// que so intercepta operacao de modelo, nao raw query.
export async function findLoginCredentials(email: string): Promise<LoginCredentials | null> {
    const rows = await prisma.$queryRaw<LoginCredentials[]>`
        SELECT * FROM hawkdot_private.find_login_credentials(${email}::citext)
    `;

    return rows[0] ?? null;
}

export type CreateUserData = {
    id: string;
    email: string;
    password_hash: string;
    display_name: string;
};

// So roda dentro de withTenant() -- users_self_insert exige
// id = current_user_id(), que precisa estar setado antes deste insert (por
// isso o id vem pronto da aplicacao, nao de gen_random_uuid() no banco).
export function createUserRecord(tx: TenantClient, data: CreateUserData) {
    return tx.users.create({ data });
}

// Roda ANTES de existir contexto de tenant (convite de membro, #23): quem
// convida so tem o e-mail do convidado, nao o id. Mesmo padrao do login --
// users_self_select bloquearia a busca, entao usa a funcao SECURITY
// DEFINER hawkdot_private.find_user_id_by_email, que devolve so o id (nunca
// password_hash nem outro dado do usuario alheio).
export async function findUserIdByEmail(email: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ id: string | null }[]>`
        SELECT hawkdot_private.find_user_id_by_email(${email}::citext) AS id
    `;

    return rows[0]?.id ?? null;
}
