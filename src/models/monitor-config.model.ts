import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { SslConfigInput, HttpConfigInput, PingConfigInput } from "@/lib/dto/monitor-config.dto";

// Mesmo padrao pai+filho documentado em AGENTS.md (#26), agora entre
// `monitors` e as tabelas *_monitor_configs, amarradas por
// (monitor_id, organization_id, monitor_type). Sem problema de RETURNING
// pelo mesmo motivo dos recursos: o ator ja e membro ativo da organizacao.

export function createSslConfig(
    tx: TenantClient,
    monitorId: string,
    organizationId: string,
    input: SslConfigInput,
) {
    return tx.ssl_monitor_configs.create({
        data: { monitor_id: monitorId, organization_id: organizationId, ...input },
    });
}

export function findSslConfig(tx: TenantClient, monitorId: string) {
    return tx.ssl_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
}

export function updateSslConfig(tx: TenantClient, monitorId: string, input: Partial<SslConfigInput>) {
    return tx.ssl_monitor_configs.update({ where: { monitor_id: monitorId }, data: input });
}

export function createHttpConfig(
    tx: TenantClient,
    monitorId: string,
    organizationId: string,
    input: HttpConfigInput,
) {
    return tx.http_monitor_configs.create({
        data: { monitor_id: monitorId, organization_id: organizationId, ...input },
    });
}

export function findHttpConfig(tx: TenantClient, monitorId: string) {
    return tx.http_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
}

export function updateHttpConfig(tx: TenantClient, monitorId: string, input: Partial<HttpConfigInput>) {
    return tx.http_monitor_configs.update({ where: { monitor_id: monitorId }, data: input });
}

export function createPingConfig(
    tx: TenantClient,
    monitorId: string,
    organizationId: string,
    input: PingConfigInput,
) {
    return tx.ping_monitor_configs.create({
        data: { monitor_id: monitorId, organization_id: organizationId, ...input },
    });
}

export function findPingConfig(tx: TenantClient, monitorId: string) {
    return tx.ping_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
}

export function updatePingConfig(tx: TenantClient, monitorId: string, input: Partial<PingConfigInput>) {
    return tx.ping_monitor_configs.update({ where: { monitor_id: monitorId }, data: input });
}
