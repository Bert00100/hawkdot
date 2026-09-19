import { createMonitorController, updateMonitorController } from "@/controllers/monitor.controller";
import { withTenant } from "@/lib/tenant/with-tenant";
import { createMonitorSchema } from "@/lib/dto/monitor.dto";
import { parseInput } from "@/lib/dto";
import { errorResponse } from "@/lib/errors";
import { basePrisma } from "@/config/database";
import { createFullTenant } from "@/test-utils/factories";
import { cleanDatabase } from "@/test-utils/cleanup";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("configs por tipo de monitor (#31)", () => {
    it("ssl: cria com defaults e le de volta corretamente", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "ssl",
                    name: "SSL do site",
                    config: { hostname: "exemplo.com" },
                }),
            ),
        );

        expect(criado.config).toMatchObject({
            hostname: "exemplo.com",
            port: 443,
            verify_chain: true,
            verify_hostname: true,
            warning_days: [30, 14, 7, 3, 1],
        });
    });

    it("ssl: warning_days vazio e recusado (ssl_warning_days_not_empty)", async () => {
        const { organization, resource } = await createFullTenant();

        expect(() =>
            parseInput(createMonitorSchema, {
                resource_id: resource.id,
                monitor_type: "ssl",
                name: "SSL invalido",
                config: { hostname: "exemplo.com", warning_days: [] },
            }),
        ).toThrow();
    });

    it("http: metodo fora de GET/HEAD/POST e recusado (http_monitor_method)", async () => {
        const { resource } = await createFullTenant();

        expect(() =>
            parseInput(createMonitorSchema, {
                resource_id: resource.id,
                monitor_type: "http",
                name: "HTTP invalido",
                config: { url: "https://exemplo.com", method: "DELETE" },
            }),
        ).toThrow();
    });

    it("http: expected_status_min maior que expected_status_max e recusado", async () => {
        const { resource } = await createFullTenant();

        expect(() =>
            parseInput(createMonitorSchema, {
                resource_id: resource.id,
                monitor_type: "http",
                name: "Faixa invertida",
                config: { url: "https://exemplo.com", expected_status_min: 500, expected_status_max: 200 },
            }),
        ).toThrow();
    });

    it("http: cria com headers customizados e le de volta", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "http",
                    name: "API com headers",
                    config: {
                        url: "https://api.exemplo.com",
                        method: "POST",
                        request_headers: { Authorization: "Bearer x" },
                    },
                }),
            ),
        );

        expect(criado.config).toMatchObject({
            method: "POST",
            request_headers: { Authorization: "Bearer x" },
        });
    });

    it("ping: packet_count fora de 1..10 e recusado (ping_packet_count)", async () => {
        const { resource } = await createFullTenant();

        expect(() =>
            parseInput(createMonitorSchema, {
                resource_id: resource.id,
                monitor_type: "ping",
                name: "Ping invalido",
                config: { host: "exemplo.com", packet_count: 11 },
            }),
        ).toThrow();
    });

    it("ping: cria e le com defaults", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "ping",
                    name: "Ping do servidor",
                    config: { host: "203.0.113.10" },
                }),
            ),
        );

        expect(criado.config).toMatchObject({ host: "203.0.113.10", packet_count: 3 });
    });

    it("atualiza o config sem afetar os campos comuns do monitor", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "ssl",
                    name: "SSL para atualizar",
                    config: { hostname: "original.com" },
                }),
            ),
        );

        const atualizado = await withTenant(session, (tx) =>
            updateMonitorController(tx, session, criado.id, {
                config: { hostname: "atualizado.com", port: 8443 },
            }),
        );

        expect(atualizado.config).toMatchObject({ hostname: "atualizado.com", port: 8443 });
        expect(atualizado.name).toBe("SSL para atualizar");
    });

    it("atualizar o config com valor invalido para o tipo retorna erro de validacao", async () => {
        const { user, organization, resource } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };
        const criado = await withTenant(session, (tx) =>
            createMonitorController(
                tx,
                session,
                parseInput(createMonitorSchema, {
                    resource_id: resource.id,
                    monitor_type: "ping",
                    name: "Ping para atualizar",
                    config: { host: "exemplo.com" },
                }),
            ),
        );

        const erro = await withTenant(session, (tx) =>
            updateMonitorController(tx, session, criado.id, {
                config: { packet_count: 99 },
            }),
        ).catch((e) => e);

        expect(errorResponse(erro).status).toBe(400);
    });
});
