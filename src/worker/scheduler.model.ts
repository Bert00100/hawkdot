import { workerBasePrisma } from "@/worker/database";

export type ReservedMonitor = {
    id: string;
    organization_id: string;
    resource_id: string;
    monitor_type: "ssl" | "http" | "ping" | "server_agent";
    interval_seconds: number | null;
    timeout_seconds: number;
};

// Roda no client base do worker (raw query, sem contexto de tenant definido
// -- nao precisa: hawkdot_private.reserve_due_monitors ve todas as
// organizacoes por dentro, SECURITY DEFINER). Ver o comentario extenso da
// funcao em db/hawkdot_postgresql17_schema.sql sobre por que essa excecao
// existe.
export async function reserveDueMonitors(limit: number): Promise<ReservedMonitor[]> {
    return workerBasePrisma.$queryRaw<ReservedMonitor[]>`
        SELECT * FROM hawkdot_private.reserve_due_monitors(${limit})
    `;
}
