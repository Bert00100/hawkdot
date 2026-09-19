import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

// Cifra segredos de credenciais (issue #39) com AES-256-GCM antes de gravar
// em hawkdot.credentials.encrypted_secret. A chave mestra vem so do
// ambiente (CREDENTIAL_ENCRYPTION_KEY) -- nunca do banco, conforme o
// comentario explicito no schema.sql ("a chave de criptografia nao deve
// ficar neste banco").
//
// Formato do blob gravado: iv (12 bytes) || authTag (16 bytes) || ciphertext.
// GCM e um modo autenticado -- authTag detecta qualquer adulteracao do
// blob cifrado, nao so decifra.
//
// encryption_key_id fica fixo numa unica versao no MVP (nao ha rotacao de
// chave implementada) -- documentado como divida tecnica conhecida em
// AGENTS.md, nao redescoberto do zero se um dia precisar rotacionar.
export const ENCRYPTION_KEY_ID = "app-v1";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function masterKey(): Buffer {
    return Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "hex");
}

export function encryptSecret(plainText: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, masterKey(), iv);

    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptSecret(blob: Buffer): string {
    const iv = blob.subarray(0, IV_LENGTH);
    const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, masterKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
