import type { TenantClient } from "@/lib/tenant/with-tenant";

export type CreateCredentialData = {
    id: string;
    organizationId: string;
    name: string;
    credentialType: "username_password" | "api_token" | "ssh_key" | "client_certificate";
    username?: string;
    encryptedSecret: Buffer;
    encryptionKeyId: string;
};

// credentials_one_secret_source so aceita UMA fonte de segredo -- so
// preenchemos encrypted_secret/encryption_key_id, nunca secret_reference
// (reservado para integracao futura com cofre externo).
export function createCredential(tx: TenantClient, data: CreateCredentialData) {
    return tx.credentials.create({
        data: {
            id: data.id,
            organization_id: data.organizationId,
            name: data.name,
            credential_type: data.credentialType,
            username: data.username,
            // Prisma tipa `Bytes` como Uint8Array<ArrayBuffer>, mais
            // estrito que o ArrayBufferLike de Buffer -- copia segura via
            // Uint8Array.from, sem custo relevante para um segredo curto.
            encrypted_secret: Uint8Array.from(data.encryptedSecret),
            encryption_key_id: data.encryptionKeyId,
        },
    });
}

export function findCredentialById(tx: TenantClient, id: string) {
    return tx.credentials.findUnique({ where: { id } });
}

export function listCredentials(tx: TenantClient) {
    return tx.credentials.findMany({ orderBy: { created_at: "desc" } });
}

export function deleteCredential(tx: TenantClient, id: string) {
    return tx.credentials.delete({ where: { id } });
}
