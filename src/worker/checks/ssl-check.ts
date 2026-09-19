import * as tls from "node:tls";
import * as net from "node:net";
import type { CheckExecutor, CheckResult } from "@/worker/checks/types";

export type SslCheckConfig = {
    hostname: string;
    port: number;
    sni_name?: string | null;
    verify_chain: boolean;
    verify_hostname: boolean;
    warning_days: number[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function certificateChain(certificate: tls.DetailedPeerCertificate) {
    const chain: Array<Record<string, unknown>> = [];
    const visited = new Set<string>();
    let current: tls.DetailedPeerCertificate | undefined = certificate;

    while (current) {
        const identity = current.fingerprint256 || current.fingerprint || current.serialNumber;
        if (visited.has(identity)) break;
        visited.add(identity);

        chain.push({
            subject: current.subject,
            issuer: current.issuer,
            valid_from: current.valid_from,
            valid_to: current.valid_to,
            fingerprint256: current.fingerprint256,
        });

        current = current.issuerCertificate;
    }

    return chain;
}

export const runSslCheck: CheckExecutor<SslCheckConfig> = (config, timeoutSeconds) => {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        let settled = false;

        const finish = (result: CheckResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(watchdog);
            socket.destroy();
            resolve(result);
        };

        // A cadeia fica a cargo do handshake do Node. O hostname e verificado
        // manualmente apos o handshake para que verify_hostname continue
        // funcionando mesmo quando verify_chain estiver desabilitado.
        //
        // SNI (servername) nao se aplica a enderecos IP por RFC 6066 --
        // passar um IP ai gera um warning de depreciacao do Node. So manda
        // servername quando o alvo e um hostname de verdade.
        const sniTarget = config.sni_name || config.hostname;
        const socket = tls.connect({
            host: config.hostname,
            port: config.port,
            servername: net.isIP(sniTarget) ? undefined : sniTarget,
            rejectUnauthorized: config.verify_chain,
            timeout: timeoutSeconds * 1000,
            checkServerIdentity: () => undefined,
        });

        // Guarda explicita alem do `timeout` do socket (que so dispara apos
        // o periodo IDLE, nao um prazo absoluto desde o inicio da conexao
        // -- em alguns ambientes isso demorou mais que o esperado). Garante
        // que a promise sempre resolve dentro de timeoutSeconds.
        const watchdog = setTimeout(() => {
            finish({
                check_status: "timeout",
                observed_state: "down",
                response_time_ms: Date.now() - startedAt,
                summary: `Tempo esgotado apos ${timeoutSeconds}s`,
                details: {},
            });
        }, timeoutSeconds * 1000);
        watchdog.unref();

        socket.once("timeout", () => {
            finish({
                check_status: "timeout",
                observed_state: "down",
                response_time_ms: Date.now() - startedAt,
                summary: `Tempo esgotado apos ${timeoutSeconds}s`,
                details: {},
            });
        });

        socket.once("error", (error) => {
            finish({
                check_status: "error",
                observed_state: "down",
                response_time_ms: Date.now() - startedAt,
                summary: error.message,
                details: {},
            });
        });

        socket.once("secureConnect", () => {
            const responseTimeMs = Date.now() - startedAt;
            const cert = socket.getPeerCertificate(true);

            if (!cert || !cert.valid_to) {
                finish({
                    check_status: "error",
                    observed_state: "down",
                    response_time_ms: responseTimeMs,
                    summary: "Certificado nao encontrado na conexao TLS.",
                    details: {},
                });
                return;
            }

            if (config.verify_hostname) {
                const hostnameError = tls.checkServerIdentity(
                    config.sni_name || config.hostname,
                    cert,
                );

                if (hostnameError) {
                    finish({
                        check_status: "failure",
                        observed_state: "down",
                        response_time_ms: responseTimeMs,
                        summary: hostnameError.message,
                        details: { certificate_chain: certificateChain(cert) },
                    });
                    return;
                }
            }

            const expiresAt = new Date(cert.valid_to);
            // Math.floor arredonda pra baixo -- um certificado que vence em
            // 23h59 ainda tem "0 dias completos restantes", mas NAO esta
            // expirado. A expiracao em si e sempre comparada por timestamp,
            // nunca pelo daysRemaining arredondado (que so serve para o
            // limiar de warning_days).
            const isExpired = expiresAt.getTime() <= Date.now();
            const daysRemaining = Math.max(
                0,
                Math.floor((expiresAt.getTime() - Date.now()) / MS_PER_DAY),
            );
            const maiorAvisoAcionado = config.warning_days.some((dias) => daysRemaining <= dias);

            const observedState: CheckResult["observed_state"] = isExpired
                ? "down"
                : maiorAvisoAcionado
                  ? "degraded"
                  : "up";

            finish({
                check_status: "success",
                observed_state: observedState,
                response_time_ms: responseTimeMs,
                summary: isExpired
                    ? "Certificado expirado."
                    : `Certificado expira em ${daysRemaining} dia(s).`,
                details: {
                    days_remaining: daysRemaining,
                    valid_to: cert.valid_to,
                    issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
                    certificate_chain: certificateChain(cert),
                },
            });
        });
    });
};
