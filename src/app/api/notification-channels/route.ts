import { parseBody } from "@/lib/dto";
import { createChannelSchema } from "@/lib/dto/channel.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createChannel, listChannelsController } from "@/controllers/notification-channel.controller";

export const GET = handleRoute(async (request: Request) =>
    okResponse(await withSession(request, (tx) => listChannelsController(tx))),
);

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createChannelSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createChannel(tx, session, input)),
        201,
    );
});
