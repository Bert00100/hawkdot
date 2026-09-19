import { decryptSecret, encryptSecret, ENCRYPTION_KEY_ID } from "@/lib/crypto/credential-encryption";

describe("encryptSecret / decryptSecret", () => {
    it("decifra exatamente o texto original", () => {
        const original = "token-super-secreto-123";

        const blob = encryptSecret(original);
        const decifrado = decryptSecret(blob);

        expect(decifrado).toBe(original);
    });

    it("o blob cifrado nunca contem o texto original em claro", () => {
        const original = "token-super-secreto-123";

        const blob = encryptSecret(original);

        expect(blob.toString("utf8")).not.toContain(original);
        expect(blob.toString("base64")).not.toContain(original);
    });

    it("duas cifragens do mesmo texto produzem blobs diferentes (IV aleatorio)", () => {
        const original = "mesmo-segredo";

        const blobA = encryptSecret(original);
        const blobB = encryptSecret(original);

        expect(blobA.equals(blobB)).toBe(false);
        expect(decryptSecret(blobA)).toBe(original);
        expect(decryptSecret(blobB)).toBe(original);
    });

    it("blob adulterado falha ao decifrar (GCM autenticado)", () => {
        const blob = encryptSecret("segredo");
        const adulterado = Buffer.from(blob);
        adulterado[adulterado.length - 1] ^= 0xff;

        expect(() => decryptSecret(adulterado)).toThrow();
    });

    it("ENCRYPTION_KEY_ID e uma unica versao fixa no MVP", () => {
        expect(ENCRYPTION_KEY_ID).toBe("app-v1");
    });
});
