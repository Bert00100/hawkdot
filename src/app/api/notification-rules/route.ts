import { parseBody } from "@/lib/dto";
import { createNotificationRuleSchema } from "@/lib/dto/notification-rule.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createRule, listRulesController } from "@/controllers/notification-rule.controller";

export const GET = handleRoute(async (request: Request) =>
    okResponse(await withSession(request, (tx) => listRulesController(tx))),
);

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createNotificationRuleSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createRule(tx, session, input)),
        201,
    );
});
