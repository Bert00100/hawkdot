import type { ChannelAdapter } from "@/notifications/adapters/types";
import { sanitizeError } from "@/notifications/adapters/types";

export type TelegramConfig = { chat_id: string; message_thread_id: number | null };

// O token do bot NUNCA aparece na mensagem de erro: a URL do Telegram
// carrega o token embutido (https://api.telegram.org/bot<token>/...), entao
// qualquer erro de rede que ecoe a URL (comum em exceptions de fetch)
// vazaria o segredo se nao fosse sanitizado explicitamente.
export const sendTelegramMessage: ChannelAdapter<TelegramConfig, string> = async ({
    config,
    secret: botToken,
    message,
    timeoutMs,
}) => {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: config.chat_id,
                message_thread_id: config.message_thread_id ?? undefined,
                text: message,
            }),
            signal: controller.signal,
        });

        const body = (await response.json().catch(() => null)) as
            | { ok?: boolean; result?: { message_id?: number }; description?: string }
            | null;

        if (!response.ok || !body?.ok) {
            const description = body?.description ?? `HTTP ${response.status}`;
            return { success: false, error: sanitizeError(description, [botToken]) };
        }

        return { success: true, providerMessageId: body.result?.message_id?.toString() };
    } catch (error) {
        const raw = error instanceof Error ? error.message : "Erro desconhecido ao chamar o Telegram.";
        return { success: false, error: sanitizeError(raw, [botToken]) };
    } finally {
        clearTimeout(timeout);
    }
};
