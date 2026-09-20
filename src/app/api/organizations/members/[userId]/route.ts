import { parseBody } from "@/lib/dto";
import { changeMemberRoleSchema } from "@/lib/dto/organization.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { changeMemberRole, removeMember } from "@/controllers/organization-member.role.controller";

export const PATCH = handleRoute(async (request: Request, ctx: RouteContext<"/api/organizations/members/[userId]">) => {
    const { userId } = await ctx.params;
    const input = await parseBody(changeMemberRoleSchema, request);
    const meta = extractRequestMeta(request);

    return okResponse(
        await withSession(request, (tx, session) => changeMemberRole(tx, session, userId, input.role, meta)),
    );
});

export const DELETE = handleRoute(async (request: Request, ctx: RouteContext<"/api/organizations/members/[userId]">) => {
    const { userId } = await ctx.params;
    const meta = extractRequestMeta(request);

    await withSession(request, (tx, session) => removeMember(tx, session, userId, meta));

    return okResponse({ ok: true });
});
