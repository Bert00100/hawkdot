import { sendTelegramMessage } from "@/notifications/adapters/telegram.adapter";

describe("sendTelegramMessage", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("envia com sucesso e devolve o message_id do provider", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
        );

        const resultado = await sendTelegramMessage({
            config: { chat_id: "123", message_thread_id: null },
            secret: "bot-token-secreto",
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado).toEqual({ success: true, providerMessageId: "42" });
    });

    it("erro da API do Telegram nunca vaza o token na mensagem de erro", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ ok: false, description: "chat not found bot-token-secreto" }),
                { status: 400 },
            ),
        );

        const resultado = await sendTelegramMessage({
            config: { chat_id: "123", message_thread_id: null },
            secret: "bot-token-secreto",
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado.success).toBe(false);
        expect((resultado as { error: string }).error).not.toContain("bot-token-secreto");
    });

    it("excecao de rede (ex.: URL vazando o token) e sanitizada", async () => {
        jest.spyOn(global, "fetch").mockRejectedValue(
            new Error("fetch failed: https://api.telegram.org/botbot-token-secreto/sendMessage"),
        );

        const resultado = await sendTelegramMessage({
            config: { chat_id: "123", message_thread_id: null },
            secret: "bot-token-secreto",
            message: "oi",
            timeoutMs: 5000,
        });

        expect(resultado.success).toBe(false);
        expect((resultado as { error: string }).error).not.toContain("bot-token-secreto");
    });
});
