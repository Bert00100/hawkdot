import { parseBody } from "@/lib/dto";
import { signupSchema } from "@/lib/dto/auth.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { signup } from "@/controllers/auth.controller";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(signupSchema, request);
    return okResponse(await signup(input), 201);
});
