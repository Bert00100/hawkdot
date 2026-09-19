import { parseBody } from "@/lib/dto";
import { createIpResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createIp } from "@/controllers/resource.controller";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createIpResourceSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createIp(tx, session, input)),
        201,
    );
});
