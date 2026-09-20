import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import { requireRole } from "@/lib/auth/require-role";
import { notFound, validationError } from "@/lib/errors";
import { recordAudit, type RequestMeta } from "@/lib/audit/record-audit";
import { acknowledgeIncident, findIncidentById } from "@/models/incident.model";

const WRITE_ROLES = ["owner", "admin", "operator"] as const;

export type IncidentResult = {
    id: string;
    monitor_id: string;
    status: string;
    severity: string;
    title: string;
    acknowledged_at: Date | null;
    acknowledged_by: string | null;
};

function shape(incident: {
    id: string;
    monitor_id: string;
    status: string;
    severity: string;
    title: string;
    acknowledged_at: Date | null;
    acknowledged_by: string | null;
}): IncidentResult {
    return {
        id: incident.id,
        monitor_id: incident.monitor_id,
        status: incident.status,
        severity: incident.severity,
        title: incident.title,
        acknowledged_at: incident.acknowledged_at,
        acknowledged_by: incident.acknowledged_by,
    };
}

export async function acknowledgeIncidentController(
    tx: TenantClient,
    session: Session,
    id: string,
    meta: RequestMeta = {},
): Promise<IncidentResult> {
    await requireRole(tx, session, [...WRITE_ROLES]);

    const existing = await findIncidentById(tx, id);
    if (!existing) {
        throw notFound("Incidente");
    }
    if (existing.status !== "open") {
        throw validationError(`Incidente nao pode ser reconhecido no status atual (${existing.status}).`);
    }

    const incident = await acknowledgeIncident(tx, id, session.userId);

    await recordAudit(tx, session, meta, {
        action: "incident.acknowledged",
        entityType: "incident",
        entityId: id,
        beforeData: { status: existing.status },
        afterData: { status: incident.status },
    });

    return shape(incident);
}
