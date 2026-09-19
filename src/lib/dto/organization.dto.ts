import { z } from "zod";
import * as dto from "@/lib/dto/common";

// organizations_slug_format / organizations_name_not_blank: mesmas
// primitivas ja usadas no signup. `status` fica de fora de proposito --
// suspensao/arquivamento e operacao administrativa, nao de usuario (#21).
export const updateOrganizationSchema = z
    .object({
        name: dto.nomeObrigatorio("O nome"),
        slug: dto.slug,
        kind: z.enum(["personal", "company"]),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({
    email: dto.email,
    role: dto.papel,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
