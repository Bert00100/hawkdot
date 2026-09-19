import type { WorkerTenantClient } from "@/worker/with-worker-tenant";
import type { SslCheckConfig } from "@/worker/checks/ssl-check";
import type { HttpCheckConfig } from "@/worker/checks/http-check";
import type { PingCheckConfig } from "@/worker/checks/ping-check";

// So leitura -- hawkdot_worker nao tem INSERT/UPDATE nas tabelas de config
// (grants verificados no #33), entao nem faria sentido essas funcoes
// escreverem.
export async function findSslCheckConfig(
    tx: WorkerTenantClient,
    monitorId: string,
): Promise<SslCheckConfig | null> {
    const config = await tx.ssl_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
    if (!config) return null;

    return {
        hostname: config.hostname,
        port: config.port,
        sni_name: config.sni_name,
        verify_chain: config.verify_chain,
        verify_hostname: config.verify_hostname,
        warning_days: config.warning_days,
    };
}

export async function findHttpCheckConfig(
    tx: WorkerTenantClient,
    monitorId: string,
): Promise<HttpCheckConfig | null> {
    const config = await tx.http_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
    if (!config) return null;

    return {
        url: config.url,
        method: config.method as HttpCheckConfig["method"],
        request_headers: config.request_headers as Record<string, string>,
        request_body: config.request_body,
        expected_status_min: config.expected_status_min,
        expected_status_max: config.expected_status_max,
        expected_body_contains: config.expected_body_contains,
        follow_redirects: config.follow_redirects,
    };
}

export async function findPingCheckConfig(
    tx: WorkerTenantClient,
    monitorId: string,
): Promise<PingCheckConfig | null> {
    const config = await tx.ping_monitor_configs.findUnique({ where: { monitor_id: monitorId } });
    if (!config) return null;

    return {
        host: config.host,
        packet_count: config.packet_count,
        // numeric(5,2) chega como Prisma.Decimal -- convertido para number
        // aqui, que e o que os executores de check esperam.
        max_packet_loss_percent: Number(config.max_packet_loss_percent),
    };
}
