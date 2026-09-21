import type { WorkerTenantClient } from "@/worker/with-worker-tenant";

// Serializa persistencia com pausa/exclusao e com outras execucoes do monitor.
export async function lockMonitorForResult(tx: WorkerTenantClient, id: string) {
    const rows = await tx.$queryRaw<{ status: string; last_check_at: Date | null }[]>`
        SELECT status, last_check_at FROM hawkdot.monitors WHERE id = ${id}::uuid FOR UPDATE
    `;
    return rows[0] ?? null;
}
