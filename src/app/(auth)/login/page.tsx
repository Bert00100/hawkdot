"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { fieldError, FormError } from "@/components/ui/field-errors";
import { Icon } from "@/components/ui/icon";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await authApi.login({ email, password });
            router.replace("/");
        } catch (err) {
            setError(err instanceof ApiError ? err : new ApiError(500, undefined));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="auth-shell">
            <div className="auth-card">
                <div className="brand auth-brand">
                    <span className="brand-mark">
                        <i />
                        <i />
                        <i />
                        <i />
                    </span>
                    <span>
                        hawk<b>dot</b>
                    </span>
                </div>
                <h1 className="auth-title">Entrar</h1>
                <p className="auth-subtitle">Acesse o painel de monitoramento da sua organização.</p>

                <FormError message={error?.message ?? null} details={error?.details} />

                <form onSubmit={handleSubmit} className="form">
                    <label className="field">
                        <span>E-mail</span>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="voce@empresa.com"
                        />
                        {fieldError(error?.details, "email") && (
                            <small className="field-error">{fieldError(error?.details, "email")}</small>
                        )}
                    </label>
                    <label className="field">
                        <span>Senha</span>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                        {fieldError(error?.details, "password") && (
                            <small className="field-error">{fieldError(error?.details, "password")}</small>
                        )}
                    </label>
                    <button className="primary auth-submit" type="submit" disabled={submitting}>
                        {submitting ? "Entrando..." : "Entrar"}
                        <Icon name="arrow" size={16} />
                    </button>
                </form>

                <p className="auth-switch">
                    Ainda não tem conta? <Link href="/signup">Criar organização</Link>
                </p>
            </div>
        </div>
    );
}
