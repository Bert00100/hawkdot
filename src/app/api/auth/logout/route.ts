import { handleRoute, okResponse } from "@/lib/errors";
import { clearSessionCookie } from "@/lib/auth/session-cookie";

// Sem tabela de sessions, o logout e inteiramente do lado do cliente: so
// limpa o cookie. Um token ja emitido continua criptograficamente valido ate
// expirar -- ver a divida tecnica documentada em AGENTS.md ("Sessao e
// revogacao"). Por isso funciona mesmo sem cookie valido presente (idempotente).
export const POST = handleRoute(async () => {
    const response = okResponse({ ok: true });
    clearSessionCookie(response);
    return response;
});
