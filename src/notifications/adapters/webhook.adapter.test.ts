import { sendWebhook } from "@/notifications/adapters/webhook.adapter";

describe("sendWebhook", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("envia com sucesso quando o endpoint responde 2xx", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

        const resultado = await sendWebhook({
            config: { url: "https://example.com/hook" },
            secret: undefined,
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado).toEqual({ success: true });
    });

    it("envia o header Authorization quando ha credencial, mas nunca vaza o valor no erro", async () => {
        const fetchMock = jest
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response("token-de-assinatura-secreto invalido", { status: 401 }));

        const resultado = await sendWebhook({
            config: { url: "https://example.com/hook" },
            secret: "token-de-assinatura-secreto",
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado.success).toBe(false);
        expect((resultado as { error: string }).error).not.toContain("token-de-assinatura-secreto");

        const [, init] = fetchMock.mock.calls[0];
        expect((init?.headers as Record<string, string>).Authorization).toBe(
            "Bearer token-de-assinatura-secreto",
        );
    });

    it("excecao de rede e sanitizada", async () => {
        jest.spyOn(global, "fetch").mockRejectedValue(
            new Error("connection reset, header Authorization: Bearer token-de-assinatura-secreto"),
        );

        const resultado = await sendWebhook({
            config: { url: "https://example.com/hook" },
            secret: "token-de-assinatura-secreto",
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado.success).toBe(false);
        expect((resultado as { error: string }).error).not.toContain("token-de-assinatura-secreto");
    });
});
