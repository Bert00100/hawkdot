import prisma from "@/config/database";

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
