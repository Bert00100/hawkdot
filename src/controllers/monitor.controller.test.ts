import {
    createMonitorController,
    deleteMonitorController,
    getMonitor,
    updateMonitorController,
} from "@/controllers/monitor.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { createMonitorSchema } from "@/lib/dto/monitor.dto";
import { parseInput } from "@/lib/dto";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { createFullTenant, createMember, createResource, createUser } from "@/test-utils/factories";
import { cleanDatabase } from "@/test-utils/cleanup";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("createMonitor / getMonitor / updateMonitor / deleteMonitor", () => {
    it("cria, le, atualiza e remove um monitor", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "Monitor de saude",
                }),
            ),
        );
        expect(criado).toMatchObject({ name: "Monitor de saude", monitor_type: "http", status: "active" });

        const lido = await withTenant(session, (tx) => getMonitor(tx, criado.id));
        expect(lido.name).toBe("Monitor de saude");

        const atualizado = await withTenant(session, (tx) =>
            updateMonitorController(tx, session, criado.id, { interval_seconds: 120 }),
        );
        expect(atualizado.interval_seconds).toBe(120);

        await withTenant(session, (tx) => deleteMonitorController(tx, session, criado.id));
        const erro = await withTenant(session, (tx) => getMonitor(tx, criado.id)).catch((e) => e);
        expect(errorResponse(erro).status).toBe(404);
    });

    it("nome duplicado no mesmo recurso retorna 409", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const dados = parseInput(createMonitorSchema, {
            resource_id: resource.id,
            monitor_type: "http",
            name: "Repetido",
        });
        await withTenant(session, (tx) => createMonitorController(tx, session, dados));

        const erro = await withTenant(session, (tx) =>
            createMonitorController(tx, session, dados),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(409);
    });

    it("resource_id de outra organizacao e barrado (400, FK)", async () => {
        const { user, organization } = await createFullTenant();
        const outroTenant = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: outroTenant.resource.id,
                    monitor_type: "http",
                    name: "Cross-tenant",
                }),
            ),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(400);
    });

    it("viewer nao consegue criar (403)", async () => {
        const { organization, resource } = await createFullTenant();
        const viewer = await createUser();
        await createMember(organization.id, viewer.id, { role: "viewer" });
        const session = { userId: viewer.id, organizationId: organization.id };

        const erro = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "Nao deveria existir",
                }),
            ),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(403);
    });

    it("campos de estado do worker nao sao editaveis pela API (nao existem no DTO)", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "Monitor X",
                }),
            ),
        );

        const atualizado = await withTenant(session, (tx) =>
            updateMonitorController(tx, session, criado.id, {
                // @ts-expect-error -- current_state nao existe no UpdateMonitorInput
                current_state: "up",
                name: "Nome Atualizado",
            }),
        );

        expect(atualizado.current_state).toBe("unknown");
        expect(atualizado.name).toBe("Nome Atualizado");
    });
});
