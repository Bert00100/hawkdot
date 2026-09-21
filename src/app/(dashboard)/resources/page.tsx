"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { useResources } from "@/hooks/use-resources";
import { deleteResourceByType } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import { ResourceFormModal } from "@/components/resources/resource-form-modal";
import type { ResourceEnvironment, ResourceStatus, ResourceType } from "@/lib/api/types";

const typeLabels: Record<ResourceType, string> = { domain: "Domínio", url_endpoint: "Endpoint", ip: "IP" };
const typeIcons: Record<ResourceType, IconName> = { domain: "globe", url_endpoint: "globe", ip: "server" };
const envLabels: Record<ResourceEnvironment, string> = {
    production: "Produção",
    staging: "Staging",
    development: "Desenvolvimento",
    other: "Outro",
};

const ROW_COLUMNS = "minmax(220px,2fr) .8fr .8fr .8fr 90px";

export default function ResourcesPage() {
    const [page, setPage] = useState(1);
    const [resourceType, setResourceType] = useState<ResourceType | "">("");
    const [status, setStatus] = useState<ResourceStatus | "">("");
    const [query, setQuery] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [created, setCreated] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { data, loading, error, reload } = useResources({
        page,
        per_page: 20,
        q: query.trim() || undefined,
        resource_type: resourceType || undefined,
        status: status || undefined,
    });

    const items = data?.items ?? [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

    async function remove(id: string, type: ResourceType, name: string) {
        if (!confirm(`Excluir o recurso "${name}"? Monitores associados a ele também serão removidos.`)) return;
        setBusyId(id);
        setActionError(null);
        try {
            await deleteResourceByType(type, id);
            if (items.length === 1 && page > 1) setPage(page - 1);
            else await reload();
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : "Falha ao excluir o recurso.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <section className="heading">
                <div>
                    <small>INFRAESTRUTURA</small>
                    <h1>Recursos</h1>
                    <p>Domínios, endpoints e IPs cadastrados para monitoramento.</p>
                </div>
                <div>
                    <button className="primary" onClick={() => setShowModal(true)}>
                        <Icon name="plus" />
                        Novo recurso
                    </button>
                </div>
            </section>

            {actionError && <div className="form-error">{actionError}</div>}
            {created && <p role="status" className="form-hint">Recurso criado. <Link href="/monitors/new">Crie um monitor</Link> para iniciar as checagens.</p>}

            <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="filters-row">
                    <label className="search" style={{ flex: 1, minWidth: 200 }}>
                        <Icon name="search" />
                        <input aria-label="Buscar recursos" maxLength={255} value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Buscar por nome..." />
                    </label>
                    <select value={resourceType} onChange={(e) => { setPage(1); setResourceType(e.target.value as ResourceType | ""); }}>
                        <option value="">Todos os tipos</option>
                        <option value="domain">Domínio</option>
                        <option value="url_endpoint">Endpoint</option>
                        <option value="ip">IP</option>
                    </select>
                    <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as ResourceStatus | ""); }}>
                        <option value="">Todos os status</option>
                        <option value="active">Ativo</option>
                        <option value="paused">Pausado</option>
                        <option value="archived">Arquivado</option>
                    </select>
                </div>
            </section>

            <section className="card monitors">
                <div className="table">
                    <div className="row table-head" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                        <span>RECURSO</span>
                        <span>TIPO</span>
                        <span>AMBIENTE</span>
                        <span>STATUS</span>
                        <span>AÇÕES</span>
                    </div>
                    {loading && <div className="empty">Carregando...</div>}
                    {error && !loading && <div className="empty" role="alert">{error}<button className="secondary" onClick={() => void reload()}>Tentar novamente</button></div>}
                    {!loading && items.map((resource) => (
                        <div className="row" key={resource.id} style={{ gridTemplateColumns: ROW_COLUMNS }}>
                            <div className="monitor-name">
                                <span className="type">
                                    <Icon name={typeIcons[resource.resource_type]} />
                                </span>
                                <div>
                                    <b>{resource.display_name}</b>
                                </div>
                            </div>
                            <span className="muted">{typeLabels[resource.resource_type]}</span>
                            <span className="env">{envLabels[resource.environment]}</span>
                            <span className={`badge badge-${resource.status}`}>
                                {resource.status === "active" ? "Ativo" : resource.status === "paused" ? "Pausado" : "Arquivado"}
                            </span>
                            <span className="row-actions">
                                <button
                                    className="icon-btn danger"
                                    title="Excluir"
                                    disabled={busyId === resource.id}
                                    onClick={() => remove(resource.id, resource.resource_type, resource.display_name)}
                                >
                                    <Icon name="trash" size={14} />
                                </button>
                            </span>
                        </div>
                    ))}
                    {!loading && !error && !items.length && <div className="empty">Nenhum recurso encontrado.</div>}
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

            {showModal && <ResourceFormModal onClose={() => setShowModal(false)} onCreated={() => { setCreated(true); void reload(); }} />}
        </>
    );
}
