"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { fieldError, FormError } from "@/components/ui/field-errors";
import { resourcesApi } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import type { ResourceEnvironment, ResourceType } from "@/lib/api/types";

const environments: { value: ResourceEnvironment; label: string }[] = [
    { value: "production", label: "Produção" },
    { value: "staging", label: "Staging" },
    { value: "development", label: "Desenvolvimento" },
    { value: "other", label: "Outro" },
];

export function ResourceFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [type, setType] = useState<ResourceType>("domain");
    const [displayName, setDisplayName] = useState("");
    const [environment, setEnvironment] = useState<ResourceEnvironment>("production");
    const [value, setValue] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    const valueField = type === "domain" ? "fqdn" : type === "url_endpoint" ? "url" : "address";
    const valueLabel = type === "domain" ? "Domínio (FQDN)" : type === "url_endpoint" ? "URL" : "Endereço IP";
    const valuePlaceholder = type === "domain" ? "exemplo.com" : type === "url_endpoint" ? "https://exemplo.com/health" : "203.0.113.10";

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            if (type === "domain") {
                await resourcesApi.createDomain({ display_name: displayName, environment, fqdn: value });
            } else if (type === "url_endpoint") {
                await resourcesApi.createEndpoint({ display_name: displayName, environment, url: value });
            } else {
                await resourcesApi.createIp({ display_name: displayName, environment, address: value });
            }
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof ApiError ? err : new ApiError(500, undefined));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal title="Novo recurso" subtitle="Cadastre um domínio, endpoint HTTP ou endereço IP para monitorar." onClose={onClose}>
            <div className="type-tabs" style={{ marginBottom: 16 }}>
                <button type="button" className={type === "domain" ? "active" : ""} onClick={() => setType("domain")}>
                    Domínio
                </button>
                <button type="button" className={type === "url_endpoint" ? "active" : ""} onClick={() => setType("url_endpoint")}>
                    Endpoint
                </button>
                <button type="button" className={type === "ip" ? "active" : ""} onClick={() => setType("ip")}>
                    IP
                </button>
            </div>

                <FormError message={error?.message ?? null} details={error?.details} />

            <form onSubmit={handleSubmit} className="form">
                <label className="field">
                    <span>Nome de exibição</span>
                    <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex.: Site principal" />
                    {fieldError(error?.details, "display_name") && (
                        <small className="field-error">{fieldError(error?.details, "display_name")}</small>
                    )}
                </label>
                <label className="field">
                    <span>{valueLabel}</span>
                    <input
                        required
                        type={type === "url_endpoint" ? "url" : "text"}
                        value={value}
                        onChange={(e) => {
                            const next = e.target.value;
                            // URL completa representa um endpoint HTTP(S). Muda
                            // a categoria automaticamente para evitar a
                            // rejeição do DTO de domínio/FQDN.
                            if (type === "domain" && /^https?:\/\//i.test(next)) setType("url_endpoint");
                            setValue(next);
                        }}
                        placeholder={valuePlaceholder}
                    />
                    <small className="form-hint">
                        {type === "domain"
                            ? "Informe apenas o domínio, por exemplo: oluvehub.com. Para uma URL com https://, use Endpoint."
                            : type === "url_endpoint"
                              ? "Use a URL completa que o worker deve consultar, incluindo https://."
                              : "Informe um endereço IPv4 ou IPv6."}
                    </small>
                    {fieldError(error?.details, valueField) && (
                        <small className="field-error">{fieldError(error?.details, valueField)}</small>
                    )}
                </label>
                <label className="field">
                    <span>Ambiente</span>
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value as ResourceEnvironment)}>
                        {environments.map((env) => (
                            <option key={env.value} value={env.value}>
                                {env.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="form-actions">
                    <button type="button" className="secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="submit" className="primary" disabled={submitting}>
                        {submitting ? "Criando..." : "Criar recurso"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
