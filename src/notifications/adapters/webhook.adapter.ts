import type { ChannelAdapter } from "@/notifications/adapters/types";
import { sanitizeError } from "@/notifications/adapters/types";

export type WebhookConfig = { url: string };

// credential_id no canal webhook e opcional -- quando presente, o segredo
// (ex.: um token de assinatura) vai num header, nunca na URL nem no corpo,
// e a mensagem de erro sanitiza esse valor do mesmo jeito que o adapter do
// Telegram sanitiza o bot token.
export const sendWebhook: ChannelAdapter<WebhookConfig, string | undefined> = async ({
    config,
    secret,
    message,
    timeoutMs,
}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
            },
            body: JSON.stringify({ message }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            return {
                success: false,
                error: sanitizeError(`HTTP ${response.status}: ${text.slice(0, 200)}`, [secret]),
            };
        }

        return { success: true };
    } catch (error) {
        const raw = error instanceof Error ? error.message : "Erro desconhecido ao chamar o webhook.";
        return { success: false, error: sanitizeError(raw, [secret]) };
    } finally {
        clearTimeout(timeout);
    }
};
