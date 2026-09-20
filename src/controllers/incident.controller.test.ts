import { acknowledgeIncidentController } from "@/controllers/incident.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { adminClient } from "@/test-utils/admin-client";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
    await adminClient.$disconnect();
});

async function createOpenIncident(organizationId: string, monitorId: string) {
    return adminClient.incidents.create({
        data: {
            organization_id: organizationId,
            monitor_id: monitorId,
            title: "Monitor fora do ar",
        },
    });
}

describe("acknowledgeIncidentController", () => {
    it("reconhece um incidente aberto e registra auditoria", async () => {
        const { user, organization, monitor } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const incidente = await createOpenIncident(organization.id, monitor.id);

        const resultado = await withTenant(session, (tx) =>
            acknowledgeIncidentController(tx, session, incidente.id),
        );

        expect(resultado).toMatchObject({ status: "acknowledged", acknowledged_by: user.id });

        const log = await adminClient.audit_logs.findFirst({
            where: { entity_type: "incident", entity_id: incidente.id },
        });
        expect(log).toMatchObject({
            action: "incident.acknowledged",
            actor_user_id: user.id,
        });
    });

    it("incidente ja reconhecido ou resolvido nao pode ser reconhecido de novo (400)", async () => {
        const { user, organization, monitor } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const incidente = await createOpenIncident(organization.id, monitor.id);
        await adminClient.incidents.update({
            where: { id: incidente.id },
            data: { status: "resolved", resolved_at: new Date() },
        });

        const erro = await withTenant(session, (tx) =>
            acknowledgeIncidentController(tx, session, incidente.id),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(400);
    });

    it.each(["operator", "viewer"] as const)(
        "%s: operator consegue, viewer nao consegue reconhecer",
        async (role) => {
            const { organization, monitor } = await createFullTenant();
            const membro = await createUser();
            await createMember(organization.id, membro.id, { role });
            const session = { userId: membro.id, organizationId: organization.id };
            const incidente = await createOpenIncident(organization.id, monitor.id);

            const resultado = await withTenant(session, (tx) =>
                acknowledgeIncidentController(tx, session, incidente.id),
            ).catch((e) => e);

            if (role === "operator") {
                expect(resultado).toMatchObject({ status: "acknowledged" });
            } else {
                expect(errorResponse(resultado).status).toBe(403);
            }
        },
    );

    it("incidente inexistente retorna 404", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            acknowledgeIncidentController(tx, session, "11111111-1111-4111-8111-111111111111"),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(404);
    });
});
