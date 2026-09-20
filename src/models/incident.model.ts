import type { TenantClient } from "@/lib/tenant/with-tenant";

// Camada da API (hawkdot_app), separada de src/worker/incident.model.ts
// (que roda como hawkdot_worker) -- mesma tabela, roles e propositos
// diferentes: o worker abre/resolve por threshold, a API so reconhece
// (acknowledge) a pedido de uma pessoa.
export function findIncidentById(tx: TenantClient, id: string) {
    return tx.incidents.findUnique({ where: { id } });
}

export function acknowledgeIncident(tx: TenantClient, id: string, userId: string) {
    return tx.incidents.update({
        where: { id },
        data: { status: "acknowledged", acknowledged_at: new Date(), acknowledged_by: userId },
    });
}
