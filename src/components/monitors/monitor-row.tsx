import Link from "next/link";
import { CheckTag } from "@/components/ui/check-tag";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MonitorState, MonitorStatus, MonitorType } from "@/lib/api/types";

export function MonitorRow({ id, name, monitorType, currentState, status, target, latencyMs, lastCheckAt, href }: {
    id: string; name: string; monitorType: MonitorType; currentState: MonitorState; status: MonitorStatus;
    target?: string; latencyMs?: number | null; lastCheckAt: string | null; href: string;
}) {
    return <Link href={href} className="monitor-row" data-monitor-id={id}>
        <span className="monitor-row-icon" data-state={status === "active" ? currentState : "paused"} />
        <div className="monitor-row-name"><b>{name}</b><div className="monitor-row-meta"><CheckTag label={monitorType === "http" ? "HTTP(S)" : monitorType.toUpperCase()} />{target && <span>{target}</span>}</div></div>
        <StatusBadge state={currentState} status={status} />
        <div className="monitor-row-metric"><small>Última checagem</small><b>{lastCheckAt ? new Date(lastCheckAt).toLocaleTimeString("pt-BR") : "Aguardando"}</b></div>
        <div className="monitor-row-metric"><small>Latência</small><b>{latencyMs != null ? `${latencyMs} ms` : "—"}</b></div>
    </Link>;
}
