import type { MonitorState } from "@/lib/api/types";

export type Tick = "up" | "degraded" | "down" | "empty";

// Sintetico por enquanto: a API ainda nao expoe historico de
// monitor_executions ao front (so o worker/testes leem essa tabela hoje) --
// sem esse endpoint novo, a barra reflete so o estado atual (todo tick
// "up" exceto o ultimo, que reflete o current_state). Reavaliar quando
// houver GET /api/monitors/[id]/executions.
export function syntheticTicks(state: MonitorState, count = 60): Tick[] {
    const ticks: Tick[] = new Array(count).fill("up");
    if (state === "degraded" || state === "down") {
        ticks[count - 1] = state;
    }
    return ticks;
}

export function UptimeBar({
    ticks,
    fromLabel,
    toLabel,
    centerLabel,
}: {
    ticks: Tick[];
    fromLabel?: string;
    toLabel?: string;
    centerLabel?: string;
}) {
    return (
        <div>
            <div className="uptime-bar">
                {ticks.map((tick, index) => (
                    <span key={index} className="tick" data-state={tick} />
                ))}
            </div>
            {(fromLabel || toLabel) && (
                <div className="uptime-bar-footer">
                    <span>{fromLabel}</span>
                    {centerLabel && <span>{centerLabel}</span>}
                    <span>{toLabel}</span>
                </div>
            )}
        </div>
    );
}
