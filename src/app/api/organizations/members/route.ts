import { parseBody, parseQuery } from "@/lib/dto";
import { paginacao } from "@/lib/dto/common";
import { inviteMemberSchema } from "@/lib/dto/organization.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { inviteMember, listMembers } from "@/controllers/organization-member.controller";

export const GET = handleRoute(async (request: Request) => {
    const pagination = parseQuery(paginacao, request);

    return okResponse(
        await withSession(request, (tx, session) => listMembers(tx, session, pagination)),
    );
});

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(inviteMemberSchema, request);
    const meta = extractRequestMeta(request);

    return okResponse(
        await withSession(request, (tx, session) => inviteMember(tx, session, input, meta)),
        201,
    );
});
