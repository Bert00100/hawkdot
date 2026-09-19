import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { getMe } from "@/controllers/session.controller";

export const GET = handleRoute(async (request: Request) =>
    okResponse(await withSession(request, (tx, session) => getMe(tx, session))),
);
