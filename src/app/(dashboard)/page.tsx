"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useMonitors } from "@/hooks/use-monitors";
import { useResources } from "@/hooks/use-resources";
import { MonitorRow } from "@/components/monitors/monitor-row";

export default function OverviewPage() {
    const { data, loading, error, refreshing, reload } = useMonitors({ per_page: 100 });
    const { data: resourcesData, error: resourcesError } = useResources({ per_page: 100 });
    const [query, setQuery] = useState("");
    const monitors = data?.items ?? [];
    const active = monitors.filter((m) => m.status === "active");
    const attention = active.filter((m) => m.current_state === "down" || m.current_state === "degraded").length;
    const waiting = active.filter((m) => !m.last_check_at || m.current_state === "unknown").length;
    const resources = new Map((resourcesData?.items ?? []).map((r) => [r.id, r.display_name]));
    const filtered = monitors.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
    const headline = error ? "Não foi possível atualizar o monitoramento" : loading ? "Carregando monitoramento..."
        : !active.length ? "Nenhum monitor ativo" : attention ? `${attention} monitor(es) requerem atenção`
        : waiting ? "Aguardando resultados das checagens" : "Monitores carregados operacionais";

    return <>
        <section className="heading">
            <div><small>CENTRAL DE OPERAÇÕES</small><h1>Visão geral</h1><p>Estado mais recente dos seus monitores. Atualização a cada 15 segundos.</p></div>
            <div>
                <button className="secondary" onClick={() => void reload()} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Atualizando..." : "Atualizar"}</button>
                <Link href="/monitors/new" className="primary"><Icon name="plus" />Novo monitor</Link>
            </div>
        </section>
        {(error || resourcesError) && <div role="alert" className="form-error">{error || resourcesError}</div>}
        <section className="health">
            <span className={attention || error ? "health-icon danger" : "health-icon"}><Icon name={attention || waiting || error || !active.length ? "warning" : "check"} /></span>
            <div><b>{headline}</b><small>{waiting ? "O estado será atualizado quando as checagens forem concluídas." : "Consulte a última checagem de cada monitor abaixo."}</small></div>
        </section>
        <section className="stats">
            {[
                ["Operacionais", active.filter((m) => m.current_state === "up").length, "estado atual dos itens carregados"],
                ["Monitores ativos", active.length, `${monitors.length} de ${data?.total ?? 0} monitores carregados`],
                ["Recursos cadastrados", resourcesData?.total ?? "—", "total na organização"],
                ["Requerem atenção", attention, `${waiting} aguardando resultado`],
            ].map(([label, value, note]) => <article className="stat" key={label}><small>{label}</small><b>{loading || error ? "—" : value}</b><p>{note}</p></article>)}
        </section>
        <section className="card monitors">
            <div className="card-head"><div><h2>Seus monitores</h2><p>Última checagem registrada, sem estimativas de histórico.</p></div>
                <label className="search"><Icon name="search" /><input aria-label="Buscar monitores carregados" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nos carregados..." /></label>
            </div>
            {filtered.slice(0, 8).map((monitor) => <MonitorRow key={monitor.id} id={monitor.id} name={monitor.name}
                monitorType={monitor.monitor_type} currentState={monitor.current_state} status={monitor.status}
                lastCheckAt={monitor.last_check_at} latencyMs={monitor.last_execution?.response_time_ms}
                target={resources.get(monitor.resource_id)} href={`/monitors/${monitor.id}`} />)}
            {loading && <div className="empty">Carregando...</div>}
            {!loading && !error && !filtered.length && <div className="empty">{query ? "Nenhum monitor encontrado nos itens carregados." : "Nenhum monitor cadastrado ainda."}</div>}
            <div className="card-head"><Link href="/monitors">Ver todos os monitores →</Link></div>
        </section>
        <footer><span>© 2026 Hawkdot</span><Link href="/api/health">Status da API →</Link></footer>
    </>;
}
