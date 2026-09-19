import { parseBody } from "@/lib/dto";
import { updateDomainResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { deleteDomain, getDomain, updateDomain } from "@/controllers/resource.controller";

type Ctx = RouteContext<"/api/resources/domains/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getDomain(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateDomainResourceSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => updateDomain(tx, session, id, input)),
    );
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    await withSession(request, (tx, session) => deleteDomain(tx, session, id));

    return okResponse({ ok: true });
});
