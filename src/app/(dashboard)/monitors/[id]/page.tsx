"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMonitor } from "@/hooks/use-monitors";
import { monitorsApi } from "@/lib/api/monitors";
import { ApiError } from "@/lib/api/client";
import { FormError } from "@/components/ui/field-errors";
import { MonitorConfigFields, editableConfig, type ConfigState } from "@/components/monitors/monitor-config-fields";
import type { MonitorResult } from "@/lib/api/types";

export default function MonitorDetailPage() {
    const params = useParams<{ id: string }>();
    const { data: monitor, loading, error, reload } = useMonitor(params.id);
    if (loading) return <div className="empty">Carregando...</div>;
    if (!monitor) return <div className="empty" role="alert">{error ?? "Monitor não encontrado."}<button className="secondary" onClick={() => void reload()}>Tentar novamente</button></div>;
    return <>
        {error && <div className="form-error" role="alert">{error}<button onClick={() => void reload()}>Tentar novamente</button></div>}
        <MonitorEditor key={monitor.id} monitor={monitor} reload={reload} />
    </>;
}

// A identidade do editor e o id, nao cada resposta do polling.
function MonitorEditor({ monitor, reload }: { monitor: MonitorResult; reload: () => Promise<void> }) {
    const router = useRouter();
    const [config, setConfig] = useState<ConfigState>(() => editableConfig(monitor.config));
    const [name, setName] = useState(monitor.name);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    async function action(work: () => Promise<unknown>, success?: string) {
        setBusy(true); setError(null); setMessage(null);
        try { await work(); await reload(); setMessage(success ?? null); }
        catch (err) { setError(err instanceof ApiError ? err : new ApiError(500, undefined)); }
        finally { setBusy(false); }
    }
    function save(event: FormEvent) {
        event.preventDefault();
        void action(() => monitorsApi.update(monitor.id, { name, config }), "Alterações salvas.");
    }
    async function remove() {
        if (!confirm(`Excluir o monitor "${monitor.name}"? Essa ação não pode ser desfeita.`)) return;
        setBusy(true); setError(null);
        try { await monitorsApi.remove(monitor.id); router.replace("/monitors"); }
        catch (err) { setError(err instanceof ApiError ? err : new ApiError(500, undefined)); setBusy(false); }
    }
    return <>
        <section className="heading"><div><small>MONITORES</small><h1>{monitor.name}</h1><StatusBadge state={monitor.current_state} status={monitor.status} /></div>
            <div><button className="secondary" disabled={busy} onClick={() => void action(() => monitorsApi.update(monitor.id, { status: monitor.status === "active" ? "paused" : "active" }))}>{monitor.status === "active" ? "Pausar" : "Reativar"}</button>
                <button className="destructive" disabled={busy} onClick={() => void remove()}>Excluir</button></div>
        </section>
        <section className="card check-result" aria-label="Última checagem">
            <h2>Última checagem</h2>
            {monitor.last_execution ? <>
                <p>{monitor.last_execution.summary}</p>
                <p>Concluída em: {new Date(monitor.last_execution.finished_at ?? monitor.last_execution.started_at).toLocaleString("pt-BR")}</p>
                <p>Latência: {monitor.last_execution.response_time_ms != null ? `${monitor.last_execution.response_time_ms} ms` : "—"}</p>
            </> : <p>Ainda não há checagens registradas.</p>}
            {monitor.status === "active" && monitor.next_check_at && <p>Próxima checagem agendada: {new Date(monitor.next_check_at).toLocaleString("pt-BR")}</p>}
            <small>Atualização automática a cada 15 segundos.</small>
        </section>
        <section className="card" style={{ padding: 24, maxWidth: 560 }}>
            <h2>Configuração</h2>
            <FormError message={error?.message ?? null} details={error?.details} />
            {message && <p role="status">{message}</p>}
            <form className="form" onSubmit={save}>
                <label className="field"><span>Nome do monitor</span><input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} /></label>
                <MonitorConfigFields monitorType={monitor.monitor_type} config={config} onChange={setConfig} errorDetails={error?.details} />
                <div className="form-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button></div>
            </form>
        </section>
    </>;
}
