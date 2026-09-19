import { z } from "zod";
import { password } from "@/lib/dto/auth.dto";
import { parseInput } from "@/lib/dto";
import { isAppError } from "@/lib/errors";

const schema = z.object({ password });

describe("politica de senha", () => {
    it.each(["senha123", "abcdefgh1", "A1b2c3d4e5"])("aceita %p", (valor) => {
        expect(() => parseInput(schema, { password: valor })).not.toThrow();
    });

    it.each([
        ["curta1", "menor que 8 caracteres"],
        ["a".repeat(130) + "1", "maior que 128 caracteres"],
        ["12345678", "so numeros, sem letra"],
        ["abcdefgh", "so letras, sem numero"],
        ["", "vazia"],
    ])("recusa %p (%s)", (valor) => {
        expect(() => parseInput(schema, { password: valor })).toThrow();
    });

    it("recusada com 400 antes de qualquer acesso ao banco", () => {
        try {
            parseInput(schema, { password: "123" });
            throw new Error("deveria ter lancado");
        } catch (error) {
            expect(isAppError(error)).toBe(true);
            if (isAppError(error)) {
                expect(error.status).toBe(400);
                expect(error.code).toBe("VALIDATION_ERROR");
            }
        }
    });
});
