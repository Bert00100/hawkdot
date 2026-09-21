"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { fieldError, FormError } from "@/components/ui/field-errors";
import { Icon } from "@/components/ui/icon";

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default function SignupPage() {
    const router = useRouter();
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [organizationName, setOrganizationName] = useState("");
    const [organizationSlug, setOrganizationSlug] = useState("");
    const [slugTouched, setSlugTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    function handleOrganizationNameChange(value: string) {
        setOrganizationName(value);
        if (!slugTouched) setOrganizationSlug(slugify(value));
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await authApi.signup({
                display_name: displayName,
                email,
                password,
                organization_name: organizationName,
                organization_slug: organizationSlug,
            });
            router.replace(`/login?criado=1`);
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
                <h1 className="auth-title">Criar organização</h1>
                <p className="auth-subtitle">Comece a monitorar sua infraestrutura em poucos minutos.</p>

                <FormError message={error?.message ?? null} details={error?.details} />

                <form onSubmit={handleSubmit} className="form">
                    <label className="field">
                        <span>Seu nome</span>
                        <input
                            required
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Lucas Mendes"
                        />
                        {fieldError(error?.details, "display_name") && (
                            <small className="field-error">{fieldError(error?.details, "display_name")}</small>
                        )}
                    </label>
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
                            placeholder="Mín. 8 caracteres, com letra e número"
                        />
                        {fieldError(error?.details, "password") && (
                            <small className="field-error">{fieldError(error?.details, "password")}</small>
                        )}
                    </label>
                    <label className="field">
                        <span>Nome da organização</span>
                        <input
                            required
                            value={organizationName}
                            onChange={(e) => handleOrganizationNameChange(e.target.value)}
                            placeholder="Hawkdot Labs"
                        />
                        {fieldError(error?.details, "organization_name") && (
                            <small className="field-error">{fieldError(error?.details, "organization_name")}</small>
                        )}
                    </label>
                    <label className="field">
                        <span>Slug da organização</span>
                        <input
                            required
                            value={organizationSlug}
                            onChange={(e) => {
                                setSlugTouched(true);
                                setOrganizationSlug(slugify(e.target.value));
                            }}
                            placeholder="hawkdot-labs"
                        />
                        {fieldError(error?.details, "organization_slug") && (
                            <small className="field-error">{fieldError(error?.details, "organization_slug")}</small>
                        )}
                    </label>
                    <button className="primary auth-submit" type="submit" disabled={submitting}>
                        {submitting ? "Criando..." : "Criar organização"}
                        <Icon name="arrow" size={16} />
                    </button>
                </form>

                <p className="auth-switch">
                    Já tem conta? <Link href="/login">Entrar</Link>
                </p>
            </div>
        </div>
    );
}
