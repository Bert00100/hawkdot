"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";

// Respostas antigas nao substituem filtros atuais; polling preserva dados.
export function useRemoteData<T>(load: (signal: AbortSignal) => Promise<T>, pollMs = 0) {
    const router = useRouter();
    const active = useRef<AbortController | null>(null);
    const [state, setState] = useState<{
        source: typeof load; data: T | null; error: string | null; pending: boolean;
    }>({ source: load, data: null, error: null, pending: true });
    const reload = useCallback(async () => {
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        setState((previous) => ({ source: load, data: previous.source === load ? previous.data : null, error: null, pending: true }));
        try {
            const data = await load(controller.signal);
            if (!controller.signal.aborted) setState({ source: load, data, error: null, pending: false });
        } catch (error) {
            if (controller.signal.aborted) return;
            if (error instanceof ApiError && error.status === 401) router.replace("/login");
            setState((previous) => ({ ...previous, pending: false,
                error: error instanceof ApiError ? error.message : "Não foi possível carregar os dados. Tente novamente." }));
        } finally {
            if (active.current === controller) active.current = null;
        }
    }, [load, router]);
    useEffect(() => {
        let disposed = false;
        queueMicrotask(() => { if (!disposed) void reload(); });
        const refresh = () => {
            if (document.visibilityState === "visible" && !active.current) void reload();
        };
        const timer = pollMs ? setInterval(refresh, pollMs) : undefined;
        if (pollMs) document.addEventListener("visibilitychange", refresh);
        return () => {
            disposed = true;
            active.current?.abort();
            active.current = null;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [reload, pollMs]);
    const current = state.source === load;
    return { data: current ? state.data : null, error: current ? state.error : null,
        loading: !current || (state.pending && !state.data), refreshing: state.pending, reload };
}
