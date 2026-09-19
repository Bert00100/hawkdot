import { parseBody } from "@/lib/dto";
import { updateNotificationRuleSchema } from "@/lib/dto/notification-rule.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { deleteRule, getRule, updateRule } from "@/controllers/notification-rule.controller";

type Ctx = RouteContext<"/api/notification-rules/[id]">;

export const GET = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    return okResponse(await withSession(request, (tx) => getRule(tx, id)));
});

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const input = await parseBody(updateNotificationRuleSchema, request);

    return okResponse(await withSession(request, (tx, session) => updateRule(tx, session, id, input)));
});

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;

    await withSession(request, (tx, session) => deleteRule(tx, session, id));

    return okResponse({ ok: true });
});
