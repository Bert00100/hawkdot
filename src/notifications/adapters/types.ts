// Interface comum de adapter (#42) -- um canal novo (email, slack, etc.)
// implementa isso e entra no REGISTRY do dispatch-pending.ts sem tocar no
// motor de entrega (#41) nem no loop de retry.
export type ChannelAdapterResult =
    | { success: true; providerMessageId?: string }
    | { success: false; error: string };

export type ChannelAdapter<TConfig, TSecret = undefined> = (params: {
    config: TConfig;
    secret: TSecret;
    message: string;
    timeoutMs: number;
}) => Promise<ChannelAdapterResult>;

// Nunca deixa a mensagem de erro carregar o segredo (token de bot, header
// de autenticacao) nem a URL inteira quando ela pode conter o segredo --
// critério de aceite do #42. Usado por todo adapter antes de devolver
// `error`.
export function sanitizeError(message: string, secrets: (string | undefined)[]): string {
    let cleaned = message;
    for (const secret of secrets) {
        if (secret) {
            cleaned = cleaned.split(secret).join("[REDACTED]");
        }
    }
    return cleaned;
}
