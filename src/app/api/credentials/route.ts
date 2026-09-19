import { parseBody } from "@/lib/dto";
import { createCredentialSchema } from "@/lib/dto/credential.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { withSession } from "@/lib/auth/require-session";
import { createCredentialController, listCredentialsController } from "@/controllers/credential.controller";

export const GET = handleRoute(async (request: Request) =>
    okResponse(await withSession(request, (tx, session) => listCredentialsController(tx, session))),
);

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(createCredentialSchema, request);

    return okResponse(
        await withSession(request, (tx, session) => createCredentialController(tx, session, input)),
        201,
    );
});
