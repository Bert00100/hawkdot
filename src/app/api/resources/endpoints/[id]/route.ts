import { parseBody } from "@/lib/dto";
import { updateEndpointResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { deleteEndpoint, getEndpoint, updateEndpoint } from "@/controllers/resource.controller";

type Ctx = RouteContext<"/api/resources/endpoints/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getEndpoint(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateEndpointResourceSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => updateEndpoint(tx, session, id, input)),
    );
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    await withSession(request, (tx, session) => deleteEndpoint(tx, session, id));

    return okResponse({ ok: true });
});
