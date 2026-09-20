import { parseQuery } from "@/lib/dto";
import { paginacao } from "@/lib/dto/common";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { listAuditLogsController } from "@/controllers/audit-log.controller";

export const GET = handleRoute(async (request: Request) => {
    const pagination = parseQuery(paginacao, request);

    return okResponse(
        await withSession(request, (tx, session) => listAuditLogsController(tx, session, pagination)),
    );
});
