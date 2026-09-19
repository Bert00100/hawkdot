import { randomUUID } from "node:crypto";
import { withTenant } from "@/lib/tenant/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { createUserRecord } from "@/models/user.model";
import { createOrganizationRecord, findOrganizationById } from "@/models/organization.model";
import { createOwnerMembership } from "@/models/organization-member.model";
import type { SignupInput } from "@/lib/dto/auth.dto";

export type SignupResult = {
    user: { id: string; email: string; display_name: string };
    organization: { id: string; name: string; slug: string };
};

// O rodape de db/hawkdot_postgresql17_schema.sql descreve o fluxo: os UUIDs
// sao gerados pela aplicacao (nao por gen_random_uuid() no banco) porque cada
// policy de insert depende do contexto de tenant estar definido ANTES do
// insert correspondente --
//   users_self_insert          WITH CHECK (id = current_user_id())
//   organizations_self_create  WITH CHECK (id = current_organization_id() ...)
//   members_insert             (... user_id = current_user_id() AND role='owner' ...)
// As tres insercoes rodam na mesma transacao de withTenant(): se qualquer
// uma falhar (ex.: e-mail duplicado), a transacao inteira desfaz -- nunca
// sobra usuario orfao sem organizacao.
//
// organizations e organization_members sao inseridos sem RETURNING (ver os
// comentarios em seus models) -- a organizacao so e lida de volta depois que
// o membership existir, quando is_organization_member() ja enxerga o
// usuario como membro ativo.
export async function signup(input: SignupInput): Promise<SignupResult> {
    const userId = randomUUID();
    const organizationId = randomUUID();
    const passwordHash = await hashPassword(input.password);

    return withTenant({ userId, organizationId }, async (tx) => {
        const user = await createUserRecord(tx, {
            id: userId,
            email: input.email,
            password_hash: passwordHash,
            display_name: input.display_name,
        });

        await createOrganizationRecord(tx, {
            id: organizationId,
            name: input.organization_name,
            slug: input.organization_slug,
        });

        await createOwnerMembership(tx, { organizationId, userId });

        const organization = await findOrganizationById(tx, organizationId);
        if (!organization) {
            // So aconteceria se um dos passos acima nao tivesse de fato
            // commitado -- nao deveria ser alcancavel em uso normal.
            throw new Error("Falha inesperada ao criar a organizacao no signup.");
        }

        // Nunca devolver password_hash na resposta.
        return {
            user: { id: user.id, email: user.email, display_name: user.display_name },
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
            },
        };
    });
}
