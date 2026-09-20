import { parseBody } from "@/lib/dto";
import { updateOrganizationSchema } from "@/lib/dto/organization.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { extractRequestMeta } from "@/lib/audit/record-audit";
import { getActiveOrganization, updateActiveOrganization } from "@/controllers/organization.controller";

export const GET = handleRoute(async (request: Request) =>
    okResponse(await withSession(request, (tx, session) => getActiveOrganization(tx, session))),
);

export const PATCH = handleRoute(async (request: Request) => {
    const input = await parseBody(updateOrganizationSchema, request);
    const meta = extractRequestMeta(request);

    return okResponse(
        await withSession(request, (tx, session) => updateActiveOrganization(tx, session, input, meta)),
    );
});
