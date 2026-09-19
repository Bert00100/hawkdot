import { parseBody } from "@/lib/dto";
import { switchOrganizationSchema } from "@/lib/dto/auth.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { getSession } from "@/lib/auth/require-session";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { switchOrganization } from "@/controllers/auth.controller";

export const POST = handleRoute(async (request: Request) => {
    const session = await getSession(request);
    const input = await parseBody(switchOrganizationSchema, request);

    const { token, organization } = await switchOrganization(session, input.organization_id);

    const response = okResponse({ organization });
    setSessionCookie(response, token);

    return response;
});
