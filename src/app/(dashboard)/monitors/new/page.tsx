"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useResources } from "@/hooks/use-resources";
import { monitorsApi, type CreateMonitorInput } from "@/lib/api/monitors";
import { ApiError } from "@/lib/api/client";
import { fieldError, FormError } from "@/components/ui/field-errors";
import { MonitorConfigFields, type ConfigState } from "@/components/monitors/monitor-config-fields";
import type { MonitorType } from "@/lib/api/types";

const defaultConfigs: Record<MonitorType, ConfigState> = {
    ssl: { port: 443, verify_chain: true, verify_hostname: true, warning_days: [30, 14, 7, 3, 1] },
    http: { method: "GET", expected_status_min: 200, expected_status_max: 399, follow_redirects: true },
    ping: { packet_count: 3, max_packet_loss_percent: 0 },
};

export default function NewMonitorPage() {
    const router = useRouter();
    const [resourcePage, setResourcePage] = useState(1);
    const { data: resourcesData, loading: resourcesLoading, error: resourcesError, reload } = useResources({ page: resourcePage, per_page: 100 });
    const resources = resourcesData?.items ?? [];

    const [monitorType, setMonitorType] = useState<MonitorType>("http");
    const [resourceId, setResourceId] = useState("");
    const [name, setName] = useState("");
    const [intervalSeconds, setIntervalSeconds] = useState(60);
    const [timeoutSeconds, setTimeoutSeconds] = useState(30);
    const [failureThreshold, setFailureThreshold] = useState(2);
    const [recoveryThreshold, setRecoveryThreshold] = useState(1);
    const [cooldownSeconds, setCooldownSeconds] = useState(300);
    const [config, setConfig] = useState<ConfigState>(defaultConfigs.http);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    function handleTypeChange(type: MonitorType) {
        setMonitorType(type);
        setConfig(defaultConfigs[type]);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const common = {
                resource_id: resourceId,
                name,
                interval_seconds: intervalSeconds,
                timeout_seconds: timeoutSeconds,
                failure_threshold: failureThreshold,
                recovery_threshold: recoveryThreshold,
                notification_cooldown_seconds: cooldownSeconds,
            };
            const input = { ...common, monitor_type: monitorType, config } as CreateMonitorInput;
            const created = await monitorsApi.create(input);
            router.replace(`/monitors/${created.id}`);
        } catch (err) {
            setError(err instanceof ApiError ? err : new ApiError(500, undefined));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <section className="heading">
                <div>
                    <small>MONITORES</small>
                    <h1>Novo monitor</h1>
                    <p>Configure um check e associe a um recurso já cadastrado.</p>
                </div>
            </section>

            <section className="card" style={{ padding: 24, maxWidth: 560 }}>
                <FormError message={error?.message ?? resourcesError} details={error?.details} />
                {resourcesError && <button className="secondary" onClick={() => void reload()}>Tentar novamente</button>}

                <form onSubmit={handleSubmit} className="form">
                    <label className="field">
                        <span>Tipo de monitor</span>
                        <div className="type-tabs">
                            <button type="button" className={monitorType === "http" ? "active" : ""} onClick={() => handleTypeChange("http")}>
                                HTTP(S)
                            </button>
                            <button type="button" className={monitorType === "ssl" ? "active" : ""} onClick={() => handleTypeChange("ssl")}>
                                SSL
                            </button>
                            <button type="button" className={monitorType === "ping" ? "active" : ""} onClick={() => handleTypeChange("ping")}>
                                Ping
                            </button>
                        </div>
                    </label>

                    <label className="field">
                        <span>Recurso monitorado</span>
                        <select required value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                            <option value="" disabled>
                                Selecione um recurso...
                            </option>
                            {resources.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.display_name}
                                </option>
                            ))}
                        </select>
                        {resourcesData && resourcesData.total > resourcesData.per_page && <span className="pagination">
                            <button type="button" className="secondary" disabled={resourcePage === 1} onClick={() => { setResourceId(""); setResourcePage(resourcePage - 1); }}>Recursos anteriores</button>
                            <span>Página {resourcePage}</span>
                            <button type="button" className="secondary" disabled={resourcePage * resourcesData.per_page >= resourcesData.total} onClick={() => { setResourceId(""); setResourcePage(resourcePage + 1); }}>Mais recursos</button>
                        </span>}
                        {resourcesLoading && <p className="form-hint">Carregando recursos...</p>}
                        {!resourcesLoading && !resourcesError && !resources.length && (
                            <p className="form-hint">Nenhum recurso cadastrado ainda — crie um em &quot;Recursos&quot; primeiro.</p>
                        )}
                        {fieldError(error?.details, "resource_id") && (
                            <small className="field-error">{fieldError(error?.details, "resource_id")}</small>
                        )}
                    </label>

                    <label className="field">
                        <span>Nome do monitor</span>
                        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: API de produção" />
                        {fieldError(error?.details, "name") && <small className="field-error">{fieldError(error?.details, "name")}</small>}
                    </label>

                    <MonitorConfigFields key={monitorType} monitorType={monitorType} config={config} onChange={setConfig} errorDetails={error?.details} />

                    <div className="field-row">
                        <label className="field">
                            <span>Intervalo (segundos)</span>
                            <input type="number" min={10} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} />
                        </label>
                        <label className="field">
                            <span>Timeout (segundos)</span>
                            <input
                                type="number"
                                min={1}
                                max={300}
                                value={timeoutSeconds}
                                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                            />
                        </label>
                    </div>
                    <div className="field-row">
                        <label className="field">
                            <span>Falhas até considerar indisponível</span>
                            <input
                                type="number"
                                max={20}
                                min={1}
                                value={failureThreshold}
                                onChange={(e) => setFailureThreshold(Number(e.target.value))}
                            />
                        </label>
                        <label className="field">
                            <span>Sucessos até considerar recuperado</span>
                            <input
                                type="number"
                                max={20}
                                min={1}
                                value={recoveryThreshold}
                                onChange={(e) => setRecoveryThreshold(Number(e.target.value))}
                            />
                        </label>
                    </div>
                    <label className="field">
                        <span>Cooldown de notificação (segundos)</span>
                        <input type="number" min={0} value={cooldownSeconds} onChange={(e) => setCooldownSeconds(Number(e.target.value))} />
                    </label>

                    <div className="form-actions">
                        <button type="button" className="secondary" onClick={() => router.back()}>
                            Cancelar
                        </button>
                        <button type="submit" className="primary" disabled={submitting || resourcesLoading || !!resourcesError || !resources.length}>
                            {submitting ? "Criando..." : "Criar monitor"}
                        </button>
                    </div>
                </form>
            </section>
        </>
    );
}
