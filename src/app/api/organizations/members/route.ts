import { parseQuery } from "@/lib/dto";
import { paginacao } from "@/lib/dto/common";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { listMembers } from "@/controllers/organization-member.controller";

export const GET = handleRoute(async (request: Request) => {
    const pagination = parseQuery(paginacao, request);

    return okResponse(
        await withSession(request, (tx, session) => listMembers(tx, session, pagination)),
    );
});
