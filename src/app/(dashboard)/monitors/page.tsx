"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMonitors } from "@/hooks/use-monitors";
import { useResources } from "@/hooks/use-resources";
import { monitorsApi } from "@/lib/api/monitors";
import { ApiError } from "@/lib/api/client";
import type { MonitorState, MonitorStatus, MonitorType } from "@/lib/api/types";

const typeLabels: Record<string, string> = { ssl: "SSL", http: "HTTP", ping: "Ping" };

function typeIcon(type: string): IconName {
    if (type === "ssl") return "lock";
    if (type === "ping") return "wifi";
    return "globe";
}

const ROW_COLUMNS = "minmax(220px,2fr) .8fr .8fr .9fr .7fr 90px";

export default function MonitorsPage() {
    const [page, setPage] = useState(1);
    const [monitorType, setMonitorType] = useState<MonitorType | "">("");
    const [status, setStatus] = useState<MonitorStatus | "">("");
    const [currentState, setCurrentState] = useState<MonitorState | "">("");
    const [query, setQuery] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { data, loading, error, reload } = useMonitors({
        page,
        per_page: 20,
        q: query.trim() || undefined,
        monitor_type: monitorType || undefined,
        status: status || undefined,
        current_state: currentState || undefined,
    });
    const { data: resourcesData } = useResources({ per_page: 100 });
    const resourceMap = new Map((resourcesData?.items ?? []).map((r) => [r.id, r]));

    const items = data?.items ?? [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

    async function toggleStatus(id: string, current: MonitorStatus) {
        setBusyId(id);
        setActionError(null);
        try {
            await monitorsApi.update(id, { status: current === "active" ? "paused" : "active" });
            await reload();
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : "Falha ao atualizar o monitor.");
        } finally {
            setBusyId(null);
        }
    }

    async function remove(id: string, name: string) {
        if (!confirm(`Excluir o monitor "${name}"? Essa ação não pode ser desfeita.`)) return;
        setBusyId(id);
        setActionError(null);
        try {
            await monitorsApi.remove(id);
            if (items.length === 1 && page > 1) setPage(page - 1);
            else await reload();
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : "Falha ao excluir o monitor.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <section className="heading">
                <div>
                    <small>INFRAESTRUTURA</small>
                    <h1>Monitores</h1>
                    <p>Todos os checks configurados na sua organização.</p>
                </div>
                <div>
                    <Link href="/monitors/new" className="primary">
                        <Icon name="plus" />
                        Novo monitor
                    </Link>
                </div>
            </section>

            {actionError && <div className="form-error">{actionError}</div>}

            <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="filters-row">
                    <label className="search" style={{ flex: 1, minWidth: 200 }}>
                        <Icon name="search" />
                        <input aria-label="Buscar monitores" maxLength={255} value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Buscar por nome..." />
                    </label>
                    <select value={monitorType} onChange={(e) => { setPage(1); setMonitorType(e.target.value as MonitorType | ""); }}>
                        <option value="">Todos os tipos</option>
                        <option value="ssl">SSL</option>
                        <option value="http">HTTP</option>
                        <option value="ping">Ping</option>
                    </select>
                    <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as MonitorStatus | ""); }}>
                        <option value="">Todos os status</option>
                        <option value="active">Ativo</option>
                        <option value="paused">Pausado</option>
                        <option value="archived">Arquivado</option>
                    </select>
                    <select value={currentState} onChange={(e) => { setPage(1); setCurrentState(e.target.value as MonitorState | ""); }}>
                        <option value="">Todos os estados</option>
                        <option value="up">Operacional</option>
                        <option value="degraded">Degradado</option>
                        <option value="down">Indisponível</option>
                        <option value="unknown">Aguardando</option>
                    </select>
                </div>
            </section>

            <section className="card monitors">
                <div className="table">
                    <div className="row table-head" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                        <span>MONITOR</span>
                        <span>ESTADO</span>
                        <span>STATUS</span>
                        <span>RECURSO</span>
                        <span>TIPO</span>
                        <span>AÇÕES</span>
                    </div>
                    {loading && <div className="empty">Carregando...</div>}
                    {error && !loading && <div className="empty" role="alert">{error}<button className="secondary" onClick={() => void reload()}>Tentar novamente</button></div>}
                    {!loading && items.map((monitor) => {
                        const resource = resourceMap.get(monitor.resource_id);
                        return (
                            <div className="row" key={monitor.id} style={{ gridTemplateColumns: ROW_COLUMNS }}>
                                <Link href={`/monitors/${monitor.id}`} className="monitor-name">
                                    <span className={`type ${monitor.current_state}`}>
                                        <Icon name={typeIcon(monitor.monitor_type)} />
                                    </span>
                                    <div>
                                        <b>{monitor.name}</b>
                                        <small className="muted">{monitor.last_check_at ? `Checado em ${new Date(monitor.last_check_at).toLocaleString("pt-BR")}` : "Aguardando primeira checagem"}</small>
                                    </div>
                                </Link>
                                <span>
                                    <StatusBadge state={monitor.current_state} status={monitor.status} />
                                </span>
                                <span className={`badge badge-${monitor.status}`}>
                                    {monitor.status === "active" ? "Ativo" : monitor.status === "paused" ? "Pausado" : "Arquivado"}
                                </span>
                                <span className="muted">{resource?.display_name ?? "—"}</span>
                                <span className="env">{typeLabels[monitor.monitor_type]}</span>
                                <span className="row-actions">
                                    <button
                                        className="icon-btn"
                                        title={monitor.status === "active" ? "Pausar" : "Reativar"}
                                        disabled={busyId === monitor.id}
                                        onClick={() => toggleStatus(monitor.id, monitor.status)}
                                    >
                                        <Icon name={monitor.status === "active" ? "pause" : "play"} size={14} />
                                    </button>
                                    <button
                                        className="icon-btn danger"
                                        title="Excluir"
                                        disabled={busyId === monitor.id}
                                        onClick={() => remove(monitor.id, monitor.name)}
                                    >
                                        <Icon name="trash" size={14} />
                                    </button>
                                </span>
                            </div>
                        );
                    })}
                    {!loading && !error && !items.length && <div className="empty">Nenhum monitor encontrado.</div>}
                </div>
            </section>

            {data && data.total > data.per_page && (
                <div className="pagination">
                    <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Anterior
                    </button>
                    <span>
                        Página {page} de {totalPages}
                    </span>
                    <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        Próxima
                    </button>
                </div>
            )}
        </>
    );
}
