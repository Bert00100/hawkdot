import { parseBody } from "@/lib/dto";
import { createEndpointResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createEndpoint } from "@/controllers/resource.controller";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createEndpointResourceSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createEndpoint(tx, session, input)),
        201,
    );
});
