import { randomUUID } from "node:crypto";
import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound } from "@/lib/errors";
import { encryptSecret, ENCRYPTION_KEY_ID } from "@/lib/crypto/credential-encryption";
import { recordAudit, type RequestMeta } from "@/lib/audit/record-audit";
import {
    createCredential,
    deleteCredential,
    findCredentialById,
    listCredentials,
} from "@/models/credential.model";
import type { CreateCredentialInput } from "@/lib/dto/credential.dto";

// credentials_admin_access (RLS) ja restringe a policy a owner/admin --
// requireRole complementa com 403 legivel em vez do erro cru do banco,
// mesmo raciocinio do #20/#11.
const CREDENTIAL_ROLES = ["owner", "admin"] as const;

export type CredentialResult = {
    id: string;
    name: string;
    credential_type: string;
    username: string | null;
    created_at: Date;
};

// O segredo NUNCA aparece na resposta, em criacao ou listagem -- so os
// metadados. E o unico jeito de garantir isso de verdade: nao selecionar
// nem formatar o campo em lugar nenhum da camada de apresentacao.
function shape(credential: {
    id: string;
    name: string;
    credential_type: string;
    username: string | null;
    created_at: Date;
}): CredentialResult {
    return {
        id: credential.id,
        name: credential.name,
        credential_type: credential.credential_type,
        username: credential.username,
        created_at: credential.created_at,
    };
}

export async function createCredentialController(
    tx: TenantClient,
    session: Session,
    input: CreateCredentialInput,
    meta: RequestMeta = {},
): Promise<CredentialResult> {
    await requireRole(tx, session, [...CREDENTIAL_ROLES]);

    const credential = await createCredential(tx, {
        id: randomUUID(),
        organizationId: session.organizationId,
        name: input.name,
        credentialType: input.credential_type,
        username: input.username,
        encryptedSecret: encryptSecret(input.secret),
        encryptionKeyId: ENCRYPTION_KEY_ID,
    });

    // Nunca o segredo -- so os metadados, os mesmos campos que ja saem na
    // resposta da API (issue #43: "jamais os valores").
    await recordAudit(tx, session, meta, {
        action: "credential.created",
        entityType: "credential",
        entityId: credential.id,
        afterData: { name: credential.name, credential_type: credential.credential_type },
    });

    return shape(credential);
}

export async function listCredentialsController(
    tx: TenantClient,
    session: Session,
): Promise<CredentialResult[]> {
    await requireRole(tx, session, [...CREDENTIAL_ROLES]);

    const credentials = await listCredentials(tx);
    return credentials.map(shape);
}

export async function deleteCredentialController(
    tx: TenantClient,
    session: Session,
    id: string,
    meta: RequestMeta = {},
): Promise<void> {
    await requireRole(tx, session, [...CREDENTIAL_ROLES]);

    const existing = await findCredentialById(tx, id);
    if (!existing) {
        throw notFound("Credencial");
    }

    await deleteCredential(tx, id);

    await recordAudit(tx, session, meta, {
        action: "credential.deleted",
        entityType: "credential",
        entityId: id,
        beforeData: { name: existing.name, credential_type: existing.credential_type },
    });
}
