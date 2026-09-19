import { parseBody } from "@/lib/dto";
import { createDomainResourceSchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createDomain } from "@/controllers/resource.controller";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createDomainResourceSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createDomain(tx, session, input)),
        201,
    );
});
