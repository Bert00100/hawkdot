import type { MonitorState, MonitorStatus } from "@/lib/api/types";

const LABELS: Record<MonitorState, string> = {
    up: "Operacional",
    degraded: "Degradado",
    down: "Fora do ar",
    unknown: "Aguardando",
};

// unknown (worker ainda nao rodou o primeiro check) usa o mesmo visual de
// "paused" -- nao e um dos 4 estados do design system, mas precisa de algum
// tratamento neutro em vez de quebrar o componente.
const DATA_STATE: Record<MonitorState, "up" | "degraded" | "down" | "paused"> = {
    up: "up",
    degraded: "degraded",
    down: "down",
    unknown: "paused",
};

// Estado sempre com cor + forma + palavra (nunca so cor) -- circulo/
// triangulo/quadrado/anel, ver globals.css .status-badge.
export function StatusBadge({ state, label, status = "active" }: { state: MonitorState; label?: string; status?: MonitorStatus }) {
    return (
        <span className="status-badge" data-state={status === "active" ? DATA_STATE[state] : "paused"}>
            <span className="glyph" />
            {label ?? (status === "paused" ? "Pausado" : status === "archived" ? "Arquivado" : LABELS[state])}
        </span>
    );
}
