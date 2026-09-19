import { parseBody } from "@/lib/dto";
import { loginSchema } from "@/lib/dto/auth.dto";
import { handleRoute, okResponse } from "@/lib/errors";
import { login } from "@/controllers/auth.controller";
import { setSessionCookie } from "@/lib/auth/session-cookie";

export const POST = handleRoute(async (request: Request) => {
    const input = await parseBody(loginSchema, request);
    const { token, ...body } = await login(input);

    const response = okResponse(body);
    setSessionCookie(response, token);

    return response;
});
