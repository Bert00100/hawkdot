import { randomUUID } from "node:crypto";
import { withTenant } from "@/lib/tenant/with-tenant";
import { dummyPasswordHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/jwt";
import { createUserRecord, findLoginCredentials } from "@/models/user.model";
import { createOrganizationRecord, findOrganizationById } from "@/models/organization.model";
import {
    createOwnerMembership,
    findActiveOrganizationMemberships,
} from "@/models/organization-member.model";
import { unauthenticated, internalError, forbidden } from "@/lib/errors";
import type { Session } from "@/lib/auth/require-session";
import type { LoginInput, SignupInput } from "@/lib/dto/auth.dto";

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

export type LoginResult = {
    token: string;
    user: { id: string; email: string; display_name: string };
    organization_id: string;
};

// Credencial invalida devolve sempre a MESMA mensagem generica -- nao
// distingue e-mail inexistente, senha errada ou conta desabilitada, para nao
// vazar qual dessas e o caso. Por isso verifyPassword roda incondicionalmente
// (contra o hash real ou contra dummyPasswordHash() quando o e-mail nao
// existe): o tempo de resposta e semelhante nos dois casos, e nao revela se
// a conta existe.
export async function login(input: LoginInput): Promise<LoginResult> {
    const credentials = await findLoginCredentials(input.email);

    const passwordHash = credentials?.password_hash ?? (await dummyPasswordHash());
    const passwordOk = await verifyPassword(input.password, passwordHash);

    if (!credentials || !passwordOk || credentials.status === "disabled") {
        throw unauthenticated("Email ou senha invalidos.");
    }

    const memberships = await findActiveOrganizationMemberships(credentials.id);
    const organizationId = memberships[0]?.organization_id;

    if (!organizationId) {
        // Nao deveria ser alcancavel: o signup (#14) sempre cria a primeira
        // organizacao do usuario na mesma transacao.
        throw internalError("Usuario sem organizacao ativa.");
    }

    const token = await signSessionToken({ user_id: credentials.id, organization_id: organizationId });

    // users_self_update (id = current_user_id()) nao depende de
    // organization_id estar "certo" para este usuario -- current_user_id() e
    // sempre o proprio id, sem o problema circular de organizations/
    // organization_members no signup. RETURNING funciona normalmente aqui.
    const user = await withTenant({ userId: credentials.id, organizationId }, (tx) =>
        tx.users.update({
            where: { id: credentials.id },
            data: { last_login_at: new Date() },
        }),
    );

    return {
        token,
        user: { id: user.id, email: user.email, display_name: user.display_name },
        organization_id: organizationId,
    };
}

export type SwitchOrganizationResult = {
    token: string;
    organization: { id: string; name: string; slug: string; role: string };
};

// Rota sensivel: e o mecanismo de trocar de tenant. Verificar que o usuario
// tem membership ACTIVE na organizacao alvo antes de reemitir o token nao e
// opcional -- sem essa checagem, pedir a troca seria o bastante para forjar
// acesso a outro tenant (o RLS ainda filtraria os dados depois, mas um
// token com organizacao errada ja e comportamento confuso e uma superficie
// de ataque desnecessaria).
export async function switchOrganization(
    session: Session,
    targetOrganizationId: string,
): Promise<SwitchOrganizationResult> {
    const memberships = await findActiveOrganizationMemberships(session.userId);
    const membership = memberships.find((m) => m.organization_id === targetOrganizationId);

    if (!membership) {
        throw forbidden("Voce nao e membro dessa organizacao.");
    }

    const token = await signSessionToken({
        user_id: session.userId,
        organization_id: targetOrganizationId,
    });

    return {
        token,
        organization: {
            id: membership.organization_id,
            name: membership.organization_name,
            slug: membership.organization_slug,
            role: membership.role,
        },
    };
}
