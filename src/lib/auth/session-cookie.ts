import type { NextResponse } from "next/server";
import { env } from "@/config/env";

// Nome do cookie que carrega o JWT de sessao. httpOnly (JavaScript no
// browser nunca le), Secure fora de desenvolvimento (HTTPS obrigatorio) e
// SameSite=lax -- nunca localStorage, que e acessivel por qualquer script e
// portanto vulneravel a XSS.
export const SESSION_COOKIE_NAME = "hawkdot_session";

export function setSessionCookie(response: NextResponse, token: string): void {
    response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: env.JWT_TTL_SECONDS,
    });
}

export function clearSessionCookie(response: NextResponse): void {
    response.cookies.delete(SESSION_COOKIE_NAME);
}

// Le o cookie de sessao do Request de entrada. Parser manual (sem lib de
// cookie) porque so precisamos extrair um valor por nome -- usar
// next/headers `cookies()` aqui exigiria escopo de request ativo do Next,
// o que quebraria testar o guard chamando a funcao direto (mesmo motivo de
// setSessionCookie usar NextResponse.cookies em vez de cookies() async).
export function readSessionCookie(request: Request): string | null {
    const header = request.headers.get("cookie");
    if (!header) return null;

    for (const part of header.split(";")) {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) continue;

        const name = part.slice(0, separatorIndex).trim();
        if (name !== SESSION_COOKIE_NAME) continue;

        return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }

    return null;
}
