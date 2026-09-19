import type { CheckResult } from "@/worker/checks/types";
import { runHttpCheck, type HttpCheckConfig } from "@/worker/checks/http-check";
import { runSslCheck, type SslCheckConfig } from "@/worker/checks/ssl-check";
import { runPingCheck, type PingCheckConfig } from "@/worker/checks/ping-check";

export type MonitorType = "ssl" | "http" | "ping";

// Registro em vez de switch: um tipo novo entra so adicionando uma entrada
// aqui, sem tocar no scheduler nem em quem chama runCheck() (issue #35).
// A assinatura generica (config: unknown) e o preco de guardar funcoes com
// tipos de config diferentes num unico objeto -- cada executor le seu
// proprio shape internamente; quem monta `config` (a persistencia do
// monitor_executions, #36) e quem garante que bate com o monitor_type.
const CHECK_EXECUTORS: Record<
    MonitorType,
    (config: unknown, timeoutSeconds: number) => Promise<CheckResult>
> = {
    ssl: runSslCheck as (config: unknown, timeoutSeconds: number) => Promise<CheckResult>,
    http: runHttpCheck as (config: unknown, timeoutSeconds: number) => Promise<CheckResult>,
    ping: runPingCheck as (config: unknown, timeoutSeconds: number) => Promise<CheckResult>,
};

export function runCheck(
    monitorType: MonitorType,
    config: SslCheckConfig | HttpCheckConfig | PingCheckConfig,
    timeoutSeconds: number,
): Promise<CheckResult> {
    return CHECK_EXECUTORS[monitorType](config, timeoutSeconds);
}
