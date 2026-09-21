"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";

// Guard de sessao do lado do client: busca /api/me e redireciona pra
// /login se vier 401. A protecao de verdade e o withSession do backend --
// isso aqui e so pra nao mostrar tela vazia/quebrada no browser.
export function useSession() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setError(null);
        try {
            setMe(await authApi.me());
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                router.replace("/login");
                return;
            }
            setError(error instanceof ApiError ? error.message : "Falha ao carregar sessão.");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        queueMicrotask(() => void reload());
        const expired = () => { setMe(null); router.replace("/login"); };
        window.addEventListener("session-expired", expired);
        return () => window.removeEventListener("session-expired", expired);
    }, [reload, router]);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();
            setMe(null);
            router.replace("/login");
        } catch {
            setError("Não foi possível sair. Tente novamente.");
        }
    }, [router]);

    return { me, loading, error, reload, logout };
}
