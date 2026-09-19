import { z } from "zod";
import * as dto from "@/lib/dto/common";

// Politica minima de senha (issue #13). Nao ha CHECK constraint no banco para
// isso -- password_hash e so um `text` nullable -- entao a regra vive
// inteiramente aqui, na borda, antes de qualquer acesso ao banco.
export const password = z
    .string()
    .min(8, "A senha deve ter no minimo 8 caracteres.")
    .max(128, "A senha deve ter no maximo 128 caracteres.")
    .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra.")
    .regex(/[0-9]/, "A senha deve conter ao menos um numero.");

export const signupSchema = z.object({
    email: dto.email,
    password,
    display_name: dto.nomeObrigatorio("O nome"),
    organization_name: dto.nomeObrigatorio("O nome da organizacao"),
    organization_slug: dto.slug,
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
    email: dto.email,
    password: z.string().min(1, "Informe a senha."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrganizationSchema = z.object({
    organization_id: dto.uuid,
});

export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;
