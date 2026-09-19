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
