import { parseBody, parseQuery } from "@/lib/dto";
import { createMonitorSchema, listMonitorsQuerySchema } from "@/lib/dto/monitor.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { createMonitorController, listMonitorsController } from "@/controllers/monitor.controller";

export const GET = handleRoute(async (request: Request) => {
    const query = parseQuery(listMonitorsQuerySchema, request);

    return okResponse(await withSession(request, (tx) => listMonitorsController(tx, query)));
});

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createMonitorSchema, request);
    const meta = extractRequestMeta(request);

    return okResponse(
        await withSession(request, (tx, session) => createMonitorController(tx, session, input, meta)),
        201,
    );
});
