import { parseBody } from "@/lib/dto";
import { createMonitorSchema } from "@/lib/dto/monitor.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createMonitorController } from "@/controllers/monitor.controller";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createMonitorSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createMonitorController(tx, session, input)),
        201,
    );
});
