"use client";

import { useState } from "react";

import type { HttpConfig, MonitorType, PingConfig, SslConfig } from "@/lib/api/types";
import type { ErrorDetail } from "@/lib/errors";
import { fieldError } from "@/components/ui/field-errors";

export type ConfigState = Partial<SslConfig & HttpConfig & PingConfig>;

// Nao reenvia metadados nem opcionais null do banco ao DTO de escrita.
export function editableConfig(value: unknown): ConfigState {
    const keys = ["hostname", "port", "sni_name", "verify_chain", "verify_hostname", "warning_days",
        "url", "method", "request_headers", "request_body", "expected_status_min", "expected_status_max",
        "expected_body_contains", "follow_redirects", "host", "packet_count", "max_packet_loss_percent"];
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, field]) => keys.includes(key) && field != null)) as ConfigState;
}

function configFieldError(details: ErrorDetail[] | undefined, field: string): string | undefined {
    return fieldError(details, `config.${field}`) ?? fieldError(details, field);
}

export function MonitorConfigFields({
    monitorType,
    config,
    onChange,
    errorDetails,
}: {
    monitorType: MonitorType;
    config: ConfigState;
    onChange: (next: ConfigState) => void;
    errorDetails?: ErrorDetail[];
}) {
    const [warningText, setWarningText] = useState(() => (config.warning_days ?? [30, 14, 7, 3, 1]).join(", "));
    function set<K extends keyof ConfigState>(key: K, value: ConfigState[K]) {
        onChange({ ...config, [key]: value });
    }

    if (monitorType === "ssl") {
        return (
            <>
                <label className="field">
                    <span>Hostname</span>
                    <input
                        required
                        value={config.hostname ?? ""}
                        onChange={(e) => set("hostname", e.target.value)}
                        placeholder="exemplo.com"
                    />
                    {configFieldError(errorDetails, "hostname") && (
                        <small className="field-error">{configFieldError(errorDetails, "hostname")}</small>
                    )}
                </label>
                <div className="field-row">
                    <label className="field">
                        <span>Porta</span>
                        <input
                            type="number"
                            required min={1} max={65535}
                            value={config.port ?? 443}
                            onChange={(e) => set("port", Number(e.target.value))}
                        />
                    </label>
                    <label className="field">
                        <span>SNI (opcional)</span>
                        <input value={config.sni_name ?? ""} onChange={(e) => set("sni_name", e.target.value)} />
                    </label>
                </div>
                <label className="field field-check">
                    <input
                        type="checkbox"
                        checked={config.verify_chain ?? true}
                        onChange={(e) => set("verify_chain", e.target.checked)}
                    />
                    <span>Validar cadeia de certificação</span>
                </label>
                <label className="field field-check">
                    <input
                        type="checkbox"
                        checked={config.verify_hostname ?? true}
                        onChange={(e) => set("verify_hostname", e.target.checked)}
                    />
                    <span>Validar hostname do certificado</span>
                </label>
                <label className="field">
                    <span>Avisar (dias antes de expirar, separados por vírgula)</span>
                    <input
                        required pattern="\s*[1-9][0-9]*(\s*,\s*[1-9][0-9]*)*\s*"
                        title="Informe dias inteiros positivos separados por vírgula."
                        value={warningText}
                        onChange={(e) => {
                            setWarningText(e.target.value);
                            set("warning_days", e.target.value.split(",").map((v) => Number(v.trim())));
                        }}
                    />
                </label>
            </>
        );
    }

    if (monitorType === "http") {
        return (
            <>
                <label className="field">
                    <span>URL</span>
                    <input required value={config.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://exemplo.com/health" />
                    {configFieldError(errorDetails, "url") && <small className="field-error">{configFieldError(errorDetails, "url")}</small>}
                </label>
                <div className="field-row">
                    <label className="field">
                        <span>Método</span>
                        <select value={config.method ?? "GET"} onChange={(e) => set("method", e.target.value as HttpConfig["method"])}>
                            <option value="GET">GET</option>
                            <option value="HEAD">HEAD</option>
                            <option value="POST">POST</option>
                        </select>
                    </label>
                    <label className="field field-check" style={{ alignSelf: "end", height: 40 }}>
                        <input
                            type="checkbox"
                            checked={config.follow_redirects ?? true}
                            onChange={(e) => set("follow_redirects", e.target.checked)}
                        />
                        <span>Seguir redirecionamentos</span>
                    </label>
                </div>
                <div className="field-row">
                    <label className="field">
                        <span>Status esperado (mín.)</span>
                        <input
                            type="number"
                            required min={100} max={599}
                            value={config.expected_status_min ?? 200}
                            onChange={(e) => set("expected_status_min", Number(e.target.value))}
                        />
                    </label>
                    <label className="field">
                        <span>Status esperado (máx.)</span>
                        <input
                            type="number"
                            required min={100} max={599}
                            value={config.expected_status_max ?? 399}
                            onChange={(e) => set("expected_status_max", Number(e.target.value))}
                        />
                    </label>
                </div>
                <label className="field">
                    <span>Corpo da resposta deve conter (opcional)</span>
                    <input value={config.expected_body_contains ?? ""} onChange={(e) => set("expected_body_contains", e.target.value)} />
                </label>
                {config.method === "POST" && (
                    <label className="field">
                        <span>Corpo da requisição (opcional)</span>
                        <textarea value={config.request_body ?? ""} onChange={(e) => set("request_body", e.target.value)} />
                    </label>
                )}
            </>
        );
    }

    return (
        <>
            <label className="field">
                <span>Host (FQDN ou IP)</span>
                <input required value={config.host ?? ""} onChange={(e) => set("host", e.target.value)} placeholder="203.0.113.10" />
                {configFieldError(errorDetails, "host") && <small className="field-error">{configFieldError(errorDetails, "host")}</small>}
            </label>
            <div className="field-row">
                <label className="field">
                    <span>Nº de pacotes</span>
                    <input
                        type="number"
                        min={1}
                        max={10}
                        value={config.packet_count ?? 3}
                        onChange={(e) => set("packet_count", Number(e.target.value))}
                    />
                </label>
                <label className="field">
                    <span>Perda máxima aceitável (%)</span>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={config.max_packet_loss_percent ?? 0}
                        onChange={(e) => set("max_packet_loss_percent", Number(e.target.value))}
                    />
                </label>
            </div>
        </>
    );
}
