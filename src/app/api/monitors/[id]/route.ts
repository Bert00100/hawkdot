import { parseBody } from "@/lib/dto";
import { updateMonitorSchema } from "@/lib/dto/monitor.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import {
    deleteMonitorController,
    getMonitor,
    updateMonitorController,
} from "@/controllers/monitor.controller";

type Ctx = RouteContext<"/api/monitors/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getMonitor(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateMonitorSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => updateMonitorController(tx, session, id, input)),
    );
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const meta = extractRequestMeta(request);

    await withSession(request, (tx, session) => deleteMonitorController(tx, session, id, meta));

    return okResponse({ ok: true });
});
