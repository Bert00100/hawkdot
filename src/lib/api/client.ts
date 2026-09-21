import type { ErrorBody, ErrorDetail } from "@/lib/errors";

// Erro tipado do lado do client -- espelha o envelope {error:{code,message,
// details}} que src/lib/errors/http.ts ja produz no backend, para os hooks
// nao precisarem reimplementar o parsing em cada chamada.
export class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: ErrorDetail[];

    constructor(status: number, body: ErrorBody["error"] | undefined) {
        super(body?.message ?? "Erro inesperado.");
        this.name = "ApiError";
        this.code = body?.code ?? "UNKNOWN";
        this.status = status;
        this.details = body?.details;
    }
}

// Cookie httpOnly de sessao -- o client nunca le nem guarda token, so
// precisa garantir que o cookie viaje na request (same-origin, mas
// explicito pra nao depender do default do fetch).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
        cache: "no-store",
    });

    if (response.status === 204) {
        return undefined as T;
    }

    const body = await response.json().catch(() => undefined);

    if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
            window.dispatchEvent(new Event("session-expired"));
        }
        throw new ApiError(response.status, (body as ErrorBody | undefined)?.error);
    }

    return body as T;
}

export const apiClient = {
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
    post: <T>(path: string, data?: unknown) =>
        request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
    patch: <T>(path: string, data?: unknown) =>
        request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
