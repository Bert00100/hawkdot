import { execFile, type ExecFileException } from "node:child_process";
import type { CheckExecutor, CheckResult } from "@/worker/checks/types";

export type PingCheckConfig = {
    host: string;
    packet_count: number;
    max_packet_loss_percent: number;
};

// ICMP de verdade normalmente exige privilegio elevado (raw socket) ou o
// sysctl net.ipv4.ping_group_range liberado para o grupo do processo --
// nem sempre disponivel no ambiente de execucao (containers, PaaS). Decisao
// documentada na issue #35: em vez de abrir socket ICMP no Node (via lib
// nativa, que teria o mesmo problema de privilegio), chama o binario `ping`
// do sistema, presente em praticamente toda imagem Linux, e interpreta a
// saida. Se o binario nao existir ou nao tiver permissao, o check volta
// como "error" (nao trava o worker inteiro).
function parsePacketLoss(output: string): number | null {
    const match = output.match(/(\d+(?:\.\d+)?)%\s*packet loss/);
    return match ? Number(match[1]) : null;
}

export const runPingCheck: CheckExecutor<PingCheckConfig> = (config, timeoutSeconds) => {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const perPacketWaitSeconds = Math.max(1, Math.floor(timeoutSeconds));

        const child = execFile(
            "ping",
            ["-c", String(config.packet_count), "-W", String(perPacketWaitSeconds), config.host],
            { timeout: timeoutSeconds * 1000 + 1000 },
            (error, stdout) => {
                const responseTimeMs = Date.now() - startedAt;

                if (error && (error as ExecFileException).killed) {
                    resolve({
                        check_status: "timeout",
                        observed_state: "down",
                        response_time_ms: responseTimeMs,
                        summary: `Tempo esgotado apos ${timeoutSeconds}s`,
                        details: {},
                    } satisfies CheckResult);
                    return;
                }

                // `ping` sai com codigo != 0 quando ha perda de pacote (ate
                // 100%) -- isso NAO e erro do executor, e exatamente o
                // resultado que estamos medindo. So cai no ramo "error" se
                // nem saida utilizavel veio (host desconhecido no /etc/hosts,
                // binario ausente, permissao negada).
                const packetLoss = parsePacketLoss(stdout);

                if (packetLoss === null) {
                    resolve({
                        check_status: "error",
                        observed_state: "down",
                        response_time_ms: responseTimeMs,
                        summary: error?.message ?? "Nao foi possivel interpretar a saida do ping.",
                        details: { stdout },
                    } satisfies CheckResult);
                    return;
                }

                const ok = packetLoss <= config.max_packet_loss_percent;

                resolve({
                    check_status: ok ? "success" : "failure",
                    observed_state: ok ? "up" : "down",
                    response_time_ms: responseTimeMs,
                    summary: `${packetLoss}% de perda de pacotes (${config.packet_count} enviados).`,
                    details: { packet_loss_percent: packetLoss },
                } satisfies CheckResult);
            },
        );

        // Sem isso o processo do worker fica preso esperando ping encerrar,
        // mesmo depois de `timeout` matar o child com SIGTERM em alguns
        // ambientes onde o kill nao propaga limpo.
        child.once("error", (error) => {
            resolve({
                check_status: "error",
                observed_state: "down",
                response_time_ms: Date.now() - startedAt,
                summary: error.message,
                details: {},
            } satisfies CheckResult);
        });
    });
};
