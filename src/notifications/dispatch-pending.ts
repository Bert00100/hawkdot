import type { TenantClient } from "@/lib/tenant/with-tenant";
import {
    findDispatchableDeliveries,
    markDeliveryFailed,
    markDeliverySent,
} from "@/models/notification-delivery.model";
import { findCredentialById } from "@/models/credential.model";
import { findTelegramChannelConfig } from "@/models/telegram-channel.model";
import { decryptSecret } from "@/lib/crypto/credential-encryption";
import { sendTelegramMessage } from "@/notifications/adapters/telegram.adapter";
import { sendWebhook, type WebhookConfig } from "@/notifications/adapters/webhook.adapter";
import type { ChannelAdapterResult } from "@/notifications/adapters/types";

const MAX_ATTEMPTS = 20;
// Backoff exponencial com teto de 1h -- um canal lento/fora do ar nao deve
// virar poll agressivo nem esperar dias entre tentativas.
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60 * 1000;

function nextBackoff(attemptCount: number): Date {
    const delay = Math.min(BASE_DELAY_MS * 2 ** (attemptCount - 1), MAX_DELAY_MS);
    return new Date(Date.now() + delay);
}

async function decryptChannelSecret(
    tx: TenantClient,
    credentialId: string | null,
): Promise<string | undefined> {
    if (!credentialId) {
        return undefined;
    }

    const credential = await findCredentialById(tx, credentialId);
    if (!credential?.encrypted_secret) {
        return undefined;
    }

    return decryptSecret(Buffer.from(credential.encrypted_secret));
}

async function send(
    tx: TenantClient,
    delivery: { channel_id: string; channel_type: string; channel_credential_id: string | null; channel_safe_config: unknown },
    message: string,
): Promise<ChannelAdapterResult> {
    const timeoutMs = 10_000;

    if (delivery.channel_type === "telegram") {
        const config = await findTelegramChannelConfig(tx, delivery.channel_id);
        const secret = await decryptChannelSecret(tx, delivery.channel_credential_id);

        if (!config) {
            return { success: false, error: "Canal telegram sem configuracao de chat_id." };
        }
        if (!secret) {
            return { success: false, error: "Canal telegram sem credencial de bot associada." };
        }

        return sendTelegramMessage({ config, secret, message, timeoutMs });
    }

    if (delivery.channel_type === "webhook") {
        const safeConfig = delivery.channel_safe_config as WebhookConfig;
        const secret = await decryptChannelSecret(tx, delivery.channel_credential_id);

        return sendWebhook({ config: safeConfig, secret, message, timeoutMs });
    }

    // browser/email fora do escopo do MVP (#39) -- nao ha adapter ainda.
    return { success: false, error: `Sem adapter para o tipo de canal '${delivery.channel_type}'.` };
}

// Falha de um canal nunca impede os outros: cada delivery e tratada
// isoladamente (try/catch por item), e o loop segue mesmo se uma delivery
// falhar de forma inesperada (bug de adapter, timeout nao capturado).
export async function dispatchPendingDeliveries(
    tx: TenantClient,
    organizationId: string,
    limit = 50,
): Promise<{ sent: number; failed: number }> {
    const deliveries = await findDispatchableDeliveries(tx, organizationId, limit);
    let sent = 0;
    let failed = 0;

    for (const delivery of deliveries) {
        // Mensagem generica por enquanto -- o conteudo detalhado do evento
        // (payload, severidade, etc.) fica para uma iteracao futura de
        // template por canal; fora do escopo de #42 (que e sobre o
        // transporte em si, retry e nao vazar segredo).
        const message = "Voce tem uma nova notificacao do hawkdot.";

        let result: ChannelAdapterResult;
        try {
            result = await send(tx, delivery, message);
        } catch (error) {
            result = {
                success: false,
                error: error instanceof Error ? error.message : "Erro desconhecido no adapter.",
            };
        }

        if (result.success) {
            await markDeliverySent(tx, delivery.id, result.providerMessageId);
            sent += 1;
            continue;
        }

        const attemptCount = delivery.attempt_count + 1;
        const nextAttemptAt = attemptCount >= MAX_ATTEMPTS ? null : nextBackoff(attemptCount);
        await markDeliveryFailed(tx, delivery.id, attemptCount, result.error, nextAttemptAt);
        failed += 1;
    }

    return { sent, failed };
}
