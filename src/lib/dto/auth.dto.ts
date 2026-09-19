import { z } from "zod";

// Politica minima de senha (issue #13). Nao ha CHECK constraint no banco para
// isso -- password_hash e so um `text` nullable -- entao a regra vive
// inteiramente aqui, na borda, antes de qualquer acesso ao banco.
export const password = z
    .string()
    .min(8, "A senha deve ter no minimo 8 caracteres.")
    .max(128, "A senha deve ter no maximo 128 caracteres.")
    .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra.")
    .regex(/[0-9]/, "A senha deve conter ao menos um numero.");
