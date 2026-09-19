import { z } from "zod";
import * as dto from "@/lib/dto/common";

// credentials_name_not_blank. secret entra em texto puro no request (HTTPS
// protege em transito) e e cifrado antes de tocar o banco -- nunca
// devolvido pela API depois de criado.
export const createCredentialSchema = z.object({
    name: dto.nomeObrigatorio("O nome"),
    credential_type: z.enum(["username_password", "api_token", "ssh_key", "client_certificate"]),
    username: z
        .string()
        .trim()
        .min(1)
        .optional(),
    secret: z.string().min(1, "Informe o segredo."),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
