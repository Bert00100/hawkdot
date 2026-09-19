import type { CheckExecutor, CheckResult } from "@/worker/checks/types";

export type HttpCheckConfig = {
    url: string;
    method: "GET" | "HEAD" | "POST";
    request_headers: Record<string, string>;
    request_body?: string | null;
    expected_status_min: number;
    expected_status_max: number;
    expected_body_contains?: string | null;
    follow_redirects: boolean;
};

export const runHttpCheck: CheckExecutor<HttpCheckConfig> = async (config, timeoutSeconds) => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
        const response = await fetch(config.url, {
            method: config.method,
            headers: config.request_headers,
            body: config.method === "POST" ? (config.request_body ?? undefined) : undefined,
            redirect: config.follow_redirects ? "follow" : "manual",
            signal: controller.signal,
        });

        const responseTimeMs = Date.now() - startedAt;
        const body = config.expected_body_contains ? await response.text() : null;

        const statusOk =
            response.status >= config.expected_status_min &&
            response.status <= config.expected_status_max;
        const bodyOk = config.expected_body_contains
            ? (body ?? "").includes(config.expected_body_contains)
            : true;
        const ok = statusOk && bodyOk;

        return {
            check_status: ok ? "success" : "failure",
            observed_state: ok ? "up" : "down",
            response_time_ms: responseTimeMs,
            summary: ok
                ? `HTTP ${response.status}`
                : `HTTP ${response.status} nao bateu com o esperado`,
            details: { status: response.status, status_ok: statusOk, body_ok: bodyOk },
        } satisfies CheckResult;
    } catch (error) {
        const responseTimeMs = Date.now() - startedAt;

        if (controller.signal.aborted) {
            return {
                check_status: "timeout",
                observed_state: "down",
                response_time_ms: responseTimeMs,
                summary: `Tempo esgotado apos ${timeoutSeconds}s`,
                details: {},
            } satisfies CheckResult;
        }

        return {
            check_status: "error",
            observed_state: "down",
            response_time_ms: responseTimeMs,
            summary: error instanceof Error ? error.message : "Erro desconhecido",
            details: {},
        } satisfies CheckResult;
    } finally {
        clearTimeout(timer);
    }
};
