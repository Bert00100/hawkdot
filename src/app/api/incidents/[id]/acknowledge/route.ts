import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { acknowledgeIncidentController } from "@/controllers/incident.controller";

type Ctx = RouteContext<"/api/incidents/[id]/acknowledge">;

export const PATCH = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const meta = extractRequestMeta(request);

    return okResponse(
        await withSession(request, (tx, session) => acknowledgeIncidentController(tx, session, id, meta)),
    );
});
