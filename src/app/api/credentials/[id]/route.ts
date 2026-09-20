import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { deleteCredentialController } from "@/controllers/credential.controller";

type Ctx = RouteContext<"/api/credentials/[id]">;

export const DELETE = handleRoute(async (request: Request, ctx: Ctx) => {
    const { id } = await ctx.params;
    const meta = extractRequestMeta(request);

    await withSession(request, (tx, session) => deleteCredentialController(tx, session, id, meta));

    return okResponse({ ok: true });
});
