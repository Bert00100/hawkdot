import { parseQuery } from "@/lib/dto";
import { listResourcesQuerySchema } from "@/lib/dto/resource.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { listResourcesController } from "@/controllers/resource.controller";

export const GET = handleRoute(async (request: Request) => {
    const query = parseQuery(listResourcesQuerySchema, request);

    return okResponse(await withSession(request, (tx) => listResourcesController(tx, query)));
});
