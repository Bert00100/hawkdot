import {
    createCredentialController,
    deleteCredentialController,
    listCredentialsController,
} from "@/controllers/credential.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { errorResponse } from "@/lib/errors";
import { decryptSecret } from "@/lib/crypto/credential-encryption";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await adminClient.$disconnect();
});

describe("createCredential / listCredentials / deleteCredential", () => {
    it("owner cria uma credencial: o segredo nunca aparece na resposta", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criada = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Bot do Telegram",
                credential_type: "api_token",
                secret: "token-secreto-123",
            }),
        );

        expect(criada).toMatchObject({ name: "Bot do Telegram", credential_type: "api_token" });
        expect(criada).not.toHaveProperty("secret");
        expect(JSON.stringify(criada)).not.toContain("token-secreto-123");
    });

    it("o segredo e gravado cifrado no banco e decifra de volta corretamente", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criada = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Bot",
                credential_type: "api_token",
                secret: "token-secreto-123",
            }),
        );

        const linha = await adminClient.credentials.findUnique({ where: { id: criada.id } });
        expect(linha?.encrypted_secret).not.toBeNull();
        expect(linha?.secret_reference).toBeNull();
        expect(Buffer.from(linha!.encrypted_secret!).toString("utf8")).not.toContain(
            "token-secreto-123",
        );
        expect(decryptSecret(Buffer.from(linha!.encrypted_secret!))).toBe("token-secreto-123");
    });

    it.each(["operator", "viewer"] as const)("%s nao consegue criar credencial (403)", async (role) => {
        const { organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role });
        const session = { userId: membro.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Nao deveria existir",
                credential_type: "api_token",
                secret: "x",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("lista e remove uma credencial", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const criada = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Para remover",
                credential_type: "api_token",
                secret: "x",
            }),
        );

        const lista = await withTenant(session, (tx) => listCredentialsController(tx, session));
        expect(lista.map((c) => c.id)).toContain(criada.id);
        expect(lista.every((c) => !("secret" in c) && !("encrypted_secret" in c))).toBe(true);

        await withTenant(session, (tx) => deleteCredentialController(tx, session, criada.id));

        const depois = await adminClient.credentials.findUnique({ where: { id: criada.id } });
        expect(depois).toBeNull();
    });

    it("nome duplicado na mesma organizacao retorna 409", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Repetido",
                credential_type: "api_token",
                secret: "x",
            }),
        );

        const erro = await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Repetido",
                credential_type: "api_token",
                secret: "y",
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });
});
