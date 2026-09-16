import { adminClient } from "./admin-client";

const tables = [
  'users', 'organization_members', 'organizations', 'resources', 'domain_resources',
  'ip_resources', 'server_resources', 'database_resources', 'endpoint_resources',
  'credentials', 'ssl_monitor_configs', 'dns_monitor_configs', 'domain_expiration_monitor_configs',
  'http_monitor_configs', 'ping_monitor_configs', 'tcp_monitor_configs', 'database_monitor_configs',
  'server_agent_monitor_configs', 'notification_channels', 'telegram_channel_configs',
  'browser_push_subscriptions', 'notification_rules', 'notification_rule_channels',
  'monitors', 'server_agents', 'monitor_executions', 'incidents', 'notification_deliveries',
  'events', 'audit_logs'
]

export async function cleanDatabase() {
  const formattedTables = tables.map(t => `"hawkdot"."${t}"`).join(', ')
  await adminClient.$executeRawUnsafe(`TRUNCATE ${formattedTables} CASCADE`)
}