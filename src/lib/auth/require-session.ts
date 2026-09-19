import { unauthenticated } from "@/lib/errors";
import { verifySessionToken } from "@/lib/auth/jwt";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { withTenant, type TenantClient } from "@/lib/tenant/with-tenant";

export type Session = {
    userId: string;
    organizationId: string;
};

// So le o cookie e valida o JWT -- nenhum acesso ao banco. Lanca 401 antes
// de qualquer query se a sessao estiver ausente ou invalida.
export async function getSession(request: Request): Promise<Session> {
    const token = readSessionCookie(request);
    const payload = token ? await verifySessionToken(token) : null;

    if (!payload) {
        throw unauthenticated();
    }

    return { userId: payload.user_id, organizationId: payload.organization_id };
}

// Guard de rota: le a sessao E abre a transacao de tenant com o mesmo
// contexto, numa chamada so. E o unico jeito suportado de obter um `tx`
// utilizavel numa rota protegida -- por isso e "impossivel esquecer o
// contexto de tenant" usando o guard: nao ha atalho que devolva sessao sem
// tambem devolver o tx correspondente.
//
//   export const GET = handleRoute((request: Request) =>
//       withSession(request, async (tx, session) => okResponse(await algo(tx, session))),
//   );
export async function withSession<T>(
    request: Request,
    callback: (tx: TenantClient, session: Session) => Promise<T>,
): Promise<T> {
    const session = await getSession(request);

    return withTenant(session, (tx) => callback(tx, session));
}
