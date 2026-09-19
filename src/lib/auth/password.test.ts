import { dummyPasswordHash, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword / verifyPassword", () => {
    it("gera um hash diferente da senha original", async () => {
        const hash = await hashPassword("senha-forte-123");

        expect(hash).not.toBe("senha-forte-123");
        expect(hash.length).toBeGreaterThan(20);
    });

    it("verifica corretamente a senha certa", async () => {
        const hash = await hashPassword("senha-forte-123");

        await expect(verifyPassword("senha-forte-123", hash)).resolves.toBe(true);
    });

    it("rejeita a senha errada", async () => {
        const hash = await hashPassword("senha-forte-123");

        await expect(verifyPassword("senha-errada-456", hash)).resolves.toBe(false);
    });

    it("dois hashes da mesma senha sao diferentes (salt aleatorio) mas ambos verificam", async () => {
        const [hashA, hashB] = await Promise.all([
            hashPassword("mesma-senha-123"),
            hashPassword("mesma-senha-123"),
        ]);

        expect(hashA).not.toBe(hashB);
        await expect(verifyPassword("mesma-senha-123", hashA)).resolves.toBe(true);
        await expect(verifyPassword("mesma-senha-123", hashB)).resolves.toBe(true);
    });

    it("usa o algoritmo argon2id (prefixo $argon2id$ no PHC string)", async () => {
        const hash = await hashPassword("senha-forte-123");

        expect(hash.startsWith("$argon2id$")).toBe(true);
    });
});

describe("dummyPasswordHash", () => {
    it("devolve um hash valido, verificavel, que nunca corresponde a senha real de ninguem", async () => {
        const dummy = await dummyPasswordHash();

        expect(dummy.startsWith("$argon2id$")).toBe(true);
        await expect(verifyPassword("qualquer-coisa", dummy)).resolves.toBe(false);
    });

    it("e memoizado -- chamadas repetidas devolvem o mesmo hash sem recalcular", async () => {
        const [primeira, segunda] = await Promise.all([dummyPasswordHash(), dummyPasswordHash()]);

        expect(primeira).toBe(segunda);
    });
});
