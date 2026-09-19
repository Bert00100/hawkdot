import { parseBody } from "@/lib/dto";
import { updateChannelSchema } from "@/lib/dto/channel.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { deleteChannel, getChannel, updateChannel } from "@/controllers/notification-channel.controller";

type Ctx = RouteContext<"/api/notification-channels/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getChannel(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateChannelSchema, request);

    return okResponse(await withSession(request, (tx, session) => updateChannel(tx, session, id, input)));
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    await withSession(request, (tx, session) => deleteChannel(tx, session, id));

    return okResponse({ ok: true });
});
