import { SignJWT, jwtVerify } from "jose";
import { env } from "@/config/env";

// user_id e organization_id sao exatamente os dois valores que alimentam o
// set_config do wrapper de tenant (withTenant) -- o token carrega so isso,
// nada de dado de perfil.
export type SessionPayload = {
    user_id: string;
    organization_id: string;
};

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export async function signSessionToken(payload: SessionPayload): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${env.JWT_TTL_SECONDS}s`)
        .sign(secretKey);
}

// null para qualquer token invalido, expirado ou malformado -- nunca lanca,
// para o chamador (guard de rota, #19) decidir uniformemente "sem sessao
// valida" sem precisar distinguir motivo.
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, secretKey);

        if (typeof payload.user_id !== "string" || typeof payload.organization_id !== "string") {
            return null;
        }

        return { user_id: payload.user_id, organization_id: payload.organization_id };
    } catch {
        return null;
    }
}
