import { parseBody } from "@/lib/dto";
import { acceptInviteSchema } from "@/lib/dto/organization.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { getSession } from "@/lib/auth/require-session";
import { acceptInvite } from "@/controllers/organization-member.controller";

// Nao usa withSession de proposito: aceitar convite opera na organizacao do
// CONVITE, nao na organizacao ativa da sessao (podem ser diferentes).
export const POST = handleRoute(async (request: Request) => {
    const session = await getSession(request);
    const input = await parseBody(acceptInviteSchema, request);

    return okResponse(await acceptInvite(session.userId, input.organization_id));
});
