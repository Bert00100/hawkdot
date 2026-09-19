import { parseBody } from "@/lib/dto";
import { updateIpResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { deleteIp, getIp, updateIp } from "@/controllers/resource.controller";

type Ctx = RouteContext<"/api/resources/ips/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getIp(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateIpResourceSchema, request);

    return okResponse(await withSession(request, (tx, session) => updateIp(tx, session, id, input)));
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    await withSession(request, (tx, session) => deleteIp(tx, session, id));

    return okResponse({ ok: true });
});
