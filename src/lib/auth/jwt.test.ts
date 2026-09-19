import { SignJWT } from "jose";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { env } from "@/config/env";

describe("signSessionToken / verifySessionToken", () => {
    it("assina e verifica um payload valido", async () => {
        const token = await signSessionToken({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        });

        await expect(verifySessionToken(token)).resolves.toEqual({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        });
    });

    it("token expirado devolve null, nao lanca (issue #16: 401, nao 500)", async () => {
        const secretKey = new TextEncoder().encode(env.JWT_SECRET);
        const tokenExpirado = await new SignJWT({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
            .sign(secretKey);

        await expect(verifySessionToken(tokenExpirado)).resolves.toBeNull();
    });

    it("token assinado com outro segredo devolve null", async () => {
        const outroSegredo = new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres");
        const tokenForjado = await new SignJWT({
            user_id: "11111111-1111-1111-1111-111111111111",
            organization_id: "22222222-2222-2222-2222-222222222222",
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(outroSegredo);

        await expect(verifySessionToken(tokenForjado)).resolves.toBeNull();
    });

    it("string malformada (nem um JWT) devolve null", async () => {
        await expect(verifySessionToken("isto-nao-e-um-jwt")).resolves.toBeNull();
    });

    it("payload sem user_id/organization_id devolve null", async () => {
        const secretKey = new TextEncoder().encode(env.JWT_SECRET);
        const tokenSemClaims = await new SignJWT({ outra_coisa: "x" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(secretKey);

        await expect(verifySessionToken(tokenSemClaims)).resolves.toBeNull();
    });
});
