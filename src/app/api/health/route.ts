import { checkDatabaseConnection } from "@/controllers/health.controller";
import { handleRoute, okResponse } from "@/lib/errors";

export const GET = handleRoute(async () => {
    return okResponse(await checkDatabaseConnection());
});
