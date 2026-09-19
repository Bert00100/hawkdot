// Interface unica dos executores de check (issue #35) -- o scheduler trata
// qualquer tipo de forma uniforme atraves dela, e um tipo novo entra so
// registrando uma funcao a mais em CHECK_EXECUTORS (run-check.ts), sem
// mudar o scheduler.
//
// Timeout e falha de rede sao RESULTADOS normais, nao excecoes: um monitor
// que falha e o funcionamento esperado do produto. Por isso todo executor
// devolve um CheckResult, nunca lanca por causa do servico monitorado --
// so lancaria por erro de programacao (config invalida, por exemplo).

export type CheckStatus = "success" | "failure" | "timeout" | "error";
export type ObservedState = "up" | "down" | "degraded";

export type CheckResult = {
    check_status: CheckStatus;
    observed_state: ObservedState;
    response_time_ms: number | null;
    summary: string;
    // monitor_execution_details_object exige objeto JSON -- nunca array,
    // string ou primitivo solto.
    details: Record<string, unknown>;
};

export type CheckExecutor<Config> = (config: Config, timeoutSeconds: number) => Promise<CheckResult>;
