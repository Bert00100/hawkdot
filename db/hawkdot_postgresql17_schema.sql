-- HawkDot - PostgreSQL 17
-- Arquitetura multi-tenant para monitoramento de SSL, DNS, HTTP, IP,
-- portas TCP, bancos de dados e VPS por agente.
--
-- Execute este arquivo com um usuario administrador que NAO seja usado pela API.
-- A API deve herdar hawkdot_app e o processador de tarefas deve herdar
-- hawkdot_worker. Nenhum deles deve ser dono das tabelas.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS hawkdot;
CREATE SCHEMA IF NOT EXISTS hawkdot_private;

REVOKE ALL ON SCHEMA hawkdot_private FROM PUBLIC;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hawkdot_app') THEN
        CREATE ROLE hawkdot_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hawkdot_worker') THEN
        CREATE ROLE hawkdot_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$roles$;

GRANT USAGE ON SCHEMA hawkdot TO hawkdot_app, hawkdot_worker;
GRANT USAGE ON SCHEMA hawkdot_private TO hawkdot_app, hawkdot_worker;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

CREATE TYPE hawkdot.user_status AS ENUM ('active', 'disabled');
CREATE TYPE hawkdot.organization_kind AS ENUM ('personal', 'company');
CREATE TYPE hawkdot.organization_status AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE hawkdot.member_role AS ENUM ('owner', 'admin', 'operator', 'viewer');
CREATE TYPE hawkdot.member_status AS ENUM ('active', 'invited', 'suspended');

CREATE TYPE hawkdot.resource_type AS ENUM (
    'domain',
    'ip',
    'server',
    'database',
    'url_endpoint'
);
CREATE TYPE hawkdot.resource_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE hawkdot.environment_type AS ENUM (
    'production',
    'staging',
    'development',
    'other'
);

CREATE TYPE hawkdot.credential_type AS ENUM (
    'username_password',
    'api_token',
    'ssh_key',
    'client_certificate'
);

CREATE TYPE hawkdot.monitor_type AS ENUM (
    'ssl',
    'dns',
    'domain_expiration',
    'http',
    'ping',
    'tcp',
    'database',
    'server_agent'
);
CREATE TYPE hawkdot.execution_mode AS ENUM ('interval', 'continuous');
CREATE TYPE hawkdot.monitor_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE hawkdot.monitor_state AS ENUM ('unknown', 'up', 'down', 'degraded');
CREATE TYPE hawkdot.check_status AS ENUM ('success', 'failure', 'timeout', 'error');

CREATE TYPE hawkdot.incident_status AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE hawkdot.severity AS ENUM ('info', 'warning', 'critical');

CREATE TYPE hawkdot.notification_channel_type AS ENUM (
    'browser',
    'telegram',
    'email',
    'webhook'
);
CREATE TYPE hawkdot.notification_delivery_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'skipped'
);

-- ---------------------------------------------------------------------------
-- Usuarios, organizacoes e membros
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               citext NOT NULL UNIQUE,
    password_hash       text,
    display_name        text NOT NULL,
    status              hawkdot.user_status NOT NULL DEFAULT 'active',
    locale              text NOT NULL DEFAULT 'pt-BR',
    timezone            text NOT NULL DEFAULT 'America/Sao_Paulo',
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_not_blank CHECK (btrim(email::text) <> ''),
    CONSTRAINT users_name_not_blank CHECK (btrim(display_name) <> '')
);

CREATE TABLE hawkdot.organizations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    slug                citext NOT NULL UNIQUE,
    kind                hawkdot.organization_kind NOT NULL DEFAULT 'personal',
    status              hawkdot.organization_status NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizations_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT organizations_slug_format CHECK (
        slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
);

CREATE TABLE hawkdot.organization_members (
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES hawkdot.users(id) ON DELETE CASCADE,
    role                hawkdot.member_role NOT NULL,
    status              hawkdot.member_status NOT NULL DEFAULT 'active',
    invited_by          uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    joined_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id),
    CONSTRAINT active_member_has_joined_at CHECK (
        status <> 'active' OR joined_at IS NOT NULL
    )
);

CREATE INDEX organization_members_user_idx
    ON hawkdot.organization_members (user_id, status);

-- ---------------------------------------------------------------------------
-- Credenciais
-- Armazene apenas referencia a um cofre externo OU segredo ja criptografado.
-- A chave de criptografia nao deve ficar neste banco.
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.credentials (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    name                text NOT NULL,
    credential_type     hawkdot.credential_type NOT NULL,
    username            text,
    secret_reference    text,
    encrypted_secret    bytea,
    encryption_key_id   text,
    created_by          uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (organization_id, name),
    CONSTRAINT credentials_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT credentials_one_secret_source CHECK (
        num_nonnulls(secret_reference, encrypted_secret) = 1
    ),
    CONSTRAINT credentials_encryption_metadata CHECK (
        encrypted_secret IS NULL OR encryption_key_id IS NOT NULL
    )
);

-- ---------------------------------------------------------------------------
-- Recursos monitorados
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.resources (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    resource_type       hawkdot.resource_type NOT NULL,
    display_name        text NOT NULL,
    environment         hawkdot.environment_type NOT NULL DEFAULT 'production',
    status              hawkdot.resource_status NOT NULL DEFAULT 'active',
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (id, organization_id, resource_type),
    CONSTRAINT resources_name_not_blank CHECK (btrim(display_name) <> ''),
    CONSTRAINT resources_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX resources_org_type_status_idx
    ON hawkdot.resources (organization_id, resource_type, status);

CREATE TABLE hawkdot.domain_resources (
    resource_id         uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'domain',
    fqdn                citext NOT NULL,
    registrar           text,
    registration_expires_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, fqdn),
    CONSTRAINT domain_resource_type CHECK (resource_type = 'domain'),
    CONSTRAINT domain_fqdn_format CHECK (
        fqdn::text ~* '^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    ),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.ip_resources (
    resource_id         uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'ip',
    address             inet NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, address),
    CONSTRAINT ip_resource_type CHECK (resource_type = 'ip'),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.server_resources (
    resource_id         uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'server',
    hostname            citext NOT NULL,
    primary_ip          inet,
    provider            text,
    operating_system    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, hostname),
    CONSTRAINT server_resource_type CHECK (resource_type = 'server'),
    CONSTRAINT server_hostname_not_blank CHECK (btrim(hostname::text) <> ''),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.database_resources (
    resource_id         uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'database',
    engine              text NOT NULL,
    host                text NOT NULL,
    port                integer NOT NULL,
    database_name       text,
    credential_id       uuid,
    tls_enabled         boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT database_resource_type CHECK (resource_type = 'database'),
    CONSTRAINT database_resource_port CHECK (port BETWEEN 1 AND 65535),
    CONSTRAINT database_resource_engine_not_blank CHECK (btrim(engine) <> ''),
    CONSTRAINT database_resource_host_not_blank CHECK (btrim(host) <> ''),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE,
    FOREIGN KEY (credential_id, organization_id)
        REFERENCES hawkdot.credentials (id, organization_id)
        ON DELETE SET NULL (credential_id)
);

CREATE TABLE hawkdot.endpoint_resources (
    resource_id         uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'url_endpoint',
    url                 text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, url),
    CONSTRAINT endpoint_resource_type CHECK (resource_type = 'url_endpoint'),
    CONSTRAINT endpoint_url_http CHECK (url ~* '^https?://'),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Monitores e agendamento
-- interval_seconds e a unidade canonica; a UI pode receber minutos ou horas.
-- continuous fica reservado a telemetria enviada por agente.
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.monitors (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    resource_id         uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL,
    name                text NOT NULL,
    execution_mode      hawkdot.execution_mode NOT NULL DEFAULT 'interval',
    interval_seconds    integer,
    timeout_seconds     integer NOT NULL DEFAULT 30,
    failure_threshold   smallint NOT NULL DEFAULT 2,
    recovery_threshold  smallint NOT NULL DEFAULT 1,
    notification_cooldown_seconds integer NOT NULL DEFAULT 300,
    status              hawkdot.monitor_status NOT NULL DEFAULT 'active',
    current_state       hawkdot.monitor_state NOT NULL DEFAULT 'unknown',
    consecutive_failures integer NOT NULL DEFAULT 0,
    consecutive_successes integer NOT NULL DEFAULT 0,
    next_check_at       timestamptz,
    last_check_at       timestamptz,
    created_by          uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (id, organization_id, monitor_type),
    UNIQUE (organization_id, resource_id, name),
    CONSTRAINT monitors_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT monitors_resource_tenant_fk
        FOREIGN KEY (resource_id, organization_id)
        REFERENCES hawkdot.resources (id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT monitors_interval_or_continuous CHECK (
        (execution_mode = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 10)
        OR
        (execution_mode = 'continuous' AND interval_seconds IS NULL)
    ),
    CONSTRAINT monitors_continuous_agent_only CHECK (
        execution_mode <> 'continuous' OR monitor_type = 'server_agent'
    ),
    CONSTRAINT monitors_timeout_range CHECK (timeout_seconds BETWEEN 1 AND 300),
    CONSTRAINT monitors_failure_threshold CHECK (failure_threshold BETWEEN 1 AND 20),
    CONSTRAINT monitors_recovery_threshold CHECK (recovery_threshold BETWEEN 1 AND 20),
    CONSTRAINT monitors_cooldown_nonnegative CHECK (notification_cooldown_seconds >= 0),
    CONSTRAINT monitors_counters_nonnegative CHECK (
        consecutive_failures >= 0 AND consecutive_successes >= 0
    )
);

CREATE INDEX monitors_due_idx
    ON hawkdot.monitors (next_check_at)
    WHERE status = 'active' AND execution_mode = 'interval';

CREATE INDEX monitors_org_state_idx
    ON hawkdot.monitors (organization_id, current_state, status);

CREATE TABLE hawkdot.server_agents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    resource_id         uuid NOT NULL,
    resource_type       hawkdot.resource_type NOT NULL DEFAULT 'server',
    name                text NOT NULL,
    token_digest        bytea NOT NULL UNIQUE,
    version             text,
    last_seen_at        timestamptz,
    revoked_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (organization_id, resource_id),
    CONSTRAINT server_agents_resource_type CHECK (resource_type = 'server'),
    CONSTRAINT server_agents_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT server_agents_token_digest_length CHECK (octet_length(token_digest) >= 32),
    FOREIGN KEY (resource_id, organization_id, resource_type)
        REFERENCES hawkdot.resources (id, organization_id, resource_type)
        ON DELETE CASCADE
);

-- Configuracoes tipadas: dados comuns ficam em monitors e dados especificos aqui.

CREATE TABLE hawkdot.ssl_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'ssl',
    hostname            text NOT NULL,
    port                integer NOT NULL DEFAULT 443,
    sni_name            text,
    verify_chain        boolean NOT NULL DEFAULT true,
    verify_hostname     boolean NOT NULL DEFAULT true,
    warning_days        integer[] NOT NULL DEFAULT ARRAY[30, 14, 7, 3, 1],
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ssl_monitor_type CHECK (monitor_type = 'ssl'),
    CONSTRAINT ssl_monitor_port CHECK (port BETWEEN 1 AND 65535),
    CONSTRAINT ssl_warning_days_not_empty CHECK (cardinality(warning_days) > 0),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.dns_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'dns',
    hostname            text NOT NULL,
    record_type         text NOT NULL,
    expected_values     text[],
    resolver            inet,
    match_all_values    boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dns_monitor_type CHECK (monitor_type = 'dns'),
    CONSTRAINT dns_record_type_supported CHECK (
        upper(record_type) IN ('A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA', 'SRV')
    ),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.domain_expiration_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'domain_expiration',
    warning_days        integer[] NOT NULL DEFAULT ARRAY[60, 30, 14, 7, 3, 1],
    detect_status_change boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT domain_expiration_monitor_type CHECK (monitor_type = 'domain_expiration'),
    CONSTRAINT domain_expiration_warning_days_not_empty CHECK (cardinality(warning_days) > 0),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.http_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'http',
    url                 text NOT NULL,
    method              text NOT NULL DEFAULT 'GET',
    request_headers     jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_body        text,
    expected_status_min integer NOT NULL DEFAULT 200,
    expected_status_max integer NOT NULL DEFAULT 399,
    expected_body_contains text,
    follow_redirects    boolean NOT NULL DEFAULT true,
    credential_id       uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT http_monitor_type CHECK (monitor_type = 'http'),
    CONSTRAINT http_monitor_url CHECK (url ~* '^https?://'),
    CONSTRAINT http_monitor_method CHECK (upper(method) IN ('GET', 'HEAD', 'POST')),
    CONSTRAINT http_monitor_headers_object CHECK (jsonb_typeof(request_headers) = 'object'),
    CONSTRAINT http_monitor_status_range CHECK (
        expected_status_min BETWEEN 100 AND 599
        AND expected_status_max BETWEEN expected_status_min AND 599
    ),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE,
    FOREIGN KEY (credential_id, organization_id)
        REFERENCES hawkdot.credentials (id, organization_id)
        ON DELETE SET NULL (credential_id)
);

CREATE TABLE hawkdot.ping_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'ping',
    host                text NOT NULL,
    packet_count        smallint NOT NULL DEFAULT 3,
    max_packet_loss_percent numeric(5,2) NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ping_monitor_type CHECK (monitor_type = 'ping'),
    CONSTRAINT ping_packet_count CHECK (packet_count BETWEEN 1 AND 10),
    CONSTRAINT ping_packet_loss CHECK (max_packet_loss_percent BETWEEN 0 AND 100),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.tcp_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'tcp',
    host                text NOT NULL,
    port                integer NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tcp_monitor_type CHECK (monitor_type = 'tcp'),
    CONSTRAINT tcp_monitor_port CHECK (port BETWEEN 1 AND 65535),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.database_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'database',
    engine              text NOT NULL,
    host                text NOT NULL,
    port                integer NOT NULL,
    database_name       text,
    credential_id       uuid NOT NULL,
    connect_only        boolean NOT NULL DEFAULT true,
    healthcheck_query   text,
    tls_enabled         boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT database_monitor_type CHECK (monitor_type = 'database'),
    CONSTRAINT database_monitor_port CHECK (port BETWEEN 1 AND 65535),
    CONSTRAINT database_monitor_query_mode CHECK (
        (connect_only AND healthcheck_query IS NULL)
        OR (NOT connect_only AND healthcheck_query IS NOT NULL)
    ),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE,
    FOREIGN KEY (credential_id, organization_id)
        REFERENCES hawkdot.credentials (id, organization_id)
        ON DELETE RESTRICT
);

CREATE TABLE hawkdot.server_agent_monitor_configs (
    monitor_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    monitor_type        hawkdot.monitor_type NOT NULL DEFAULT 'server_agent',
    agent_id            uuid NOT NULL,
    heartbeat_timeout_seconds integer NOT NULL DEFAULT 90,
    cpu_warning_percent numeric(5,2) NOT NULL DEFAULT 85,
    memory_warning_percent numeric(5,2) NOT NULL DEFAULT 85,
    disk_warning_percent numeric(5,2) NOT NULL DEFAULT 85,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT server_agent_monitor_type CHECK (monitor_type = 'server_agent'),
    CONSTRAINT server_agent_heartbeat_timeout CHECK (heartbeat_timeout_seconds BETWEEN 15 AND 3600),
    CONSTRAINT server_agent_cpu_threshold CHECK (cpu_warning_percent BETWEEN 0 AND 100),
    CONSTRAINT server_agent_memory_threshold CHECK (memory_warning_percent BETWEEN 0 AND 100),
    CONSTRAINT server_agent_disk_threshold CHECK (disk_warning_percent BETWEEN 0 AND 100),
    FOREIGN KEY (monitor_id, organization_id, monitor_type)
        REFERENCES hawkdot.monitors (id, organization_id, monitor_type)
        ON DELETE CASCADE,
    FOREIGN KEY (agent_id, organization_id)
        REFERENCES hawkdot.server_agents (id, organization_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Execucoes, incidentes e eventos
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.monitor_executions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    monitor_id          uuid NOT NULL,
    check_status        hawkdot.check_status NOT NULL,
    observed_state      hawkdot.monitor_state NOT NULL,
    started_at          timestamptz NOT NULL,
    finished_at         timestamptz,
    duration_ms         integer,
    response_time_ms    integer,
    worker_region       text,
    summary             text,
    details             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    CONSTRAINT monitor_execution_tenant_fk
        FOREIGN KEY (monitor_id, organization_id)
        REFERENCES hawkdot.monitors (id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT monitor_execution_time_order CHECK (
        finished_at IS NULL OR finished_at >= started_at
    ),
    CONSTRAINT monitor_execution_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT monitor_execution_response_time CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
    CONSTRAINT monitor_execution_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX monitor_executions_monitor_started_idx
    ON hawkdot.monitor_executions (organization_id, monitor_id, started_at DESC);

CREATE INDEX monitor_executions_started_brin_idx
    ON hawkdot.monitor_executions USING brin (started_at);

CREATE TABLE hawkdot.incidents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    monitor_id          uuid NOT NULL,
    status              hawkdot.incident_status NOT NULL DEFAULT 'open',
    severity            hawkdot.severity NOT NULL DEFAULT 'critical',
    title               text NOT NULL,
    cause               text,
    opened_by_execution_id uuid,
    resolved_by_execution_id uuid,
    opened_at           timestamptz NOT NULL DEFAULT now(),
    acknowledged_at     timestamptz,
    acknowledged_by     uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    CONSTRAINT incidents_monitor_tenant_fk
        FOREIGN KEY (monitor_id, organization_id)
        REFERENCES hawkdot.monitors (id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT incidents_open_execution_fk
        FOREIGN KEY (opened_by_execution_id, organization_id)
        REFERENCES hawkdot.monitor_executions (id, organization_id)
        ON DELETE SET NULL (opened_by_execution_id),
    CONSTRAINT incidents_resolved_execution_fk
        FOREIGN KEY (resolved_by_execution_id, organization_id)
        REFERENCES hawkdot.monitor_executions (id, organization_id)
        ON DELETE SET NULL (resolved_by_execution_id),
    CONSTRAINT incidents_resolution_consistency CHECK (
        (status = 'resolved' AND resolved_at IS NOT NULL)
        OR (status <> 'resolved' AND resolved_at IS NULL)
    )
);

CREATE UNIQUE INDEX incidents_one_active_per_monitor_idx
    ON hawkdot.incidents (organization_id, monitor_id)
    WHERE status IN ('open', 'acknowledged');

CREATE INDEX incidents_org_status_opened_idx
    ON hawkdot.incidents (organization_id, status, opened_at DESC);

CREATE TABLE hawkdot.events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    monitor_id          uuid,
    incident_id         uuid,
    execution_id        uuid,
    event_code          text NOT NULL,
    severity            hawkdot.severity NOT NULL,
    message             text NOT NULL,
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    happened_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    CONSTRAINT events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    FOREIGN KEY (monitor_id, organization_id)
        REFERENCES hawkdot.monitors (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (incident_id, organization_id)
        REFERENCES hawkdot.incidents (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (execution_id, organization_id)
        REFERENCES hawkdot.monitor_executions (id, organization_id)
        ON DELETE SET NULL (execution_id)
);

CREATE INDEX events_org_happened_idx
    ON hawkdot.events (organization_id, happened_at DESC);

-- ---------------------------------------------------------------------------
-- Notificacoes: navegador, Telegram, e-mail e webhook
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.notification_channels (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    channel_type        hawkdot.notification_channel_type NOT NULL,
    name                text NOT NULL,
    enabled             boolean NOT NULL DEFAULT true,
    credential_id       uuid,
    safe_config         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (id, organization_id, channel_type),
    UNIQUE (organization_id, name),
    CONSTRAINT notification_channels_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT notification_channels_config_object CHECK (jsonb_typeof(safe_config) = 'object'),
    FOREIGN KEY (credential_id, organization_id)
        REFERENCES hawkdot.credentials (id, organization_id)
        ON DELETE SET NULL (credential_id)
);

CREATE TABLE hawkdot.telegram_channel_configs (
    channel_id          uuid PRIMARY KEY,
    organization_id     uuid NOT NULL,
    channel_type        hawkdot.notification_channel_type NOT NULL DEFAULT 'telegram',
    chat_id             text NOT NULL,
    message_thread_id   bigint,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT telegram_channel_type CHECK (channel_type = 'telegram'),
    CONSTRAINT telegram_chat_id_not_blank CHECK (btrim(chat_id) <> ''),
    FOREIGN KEY (channel_id, organization_id, channel_type)
        REFERENCES hawkdot.notification_channels (id, organization_id, channel_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.browser_push_subscriptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    channel_id          uuid NOT NULL,
    channel_type        hawkdot.notification_channel_type NOT NULL DEFAULT 'browser',
    user_id             uuid NOT NULL REFERENCES hawkdot.users(id) ON DELETE CASCADE,
    endpoint            text NOT NULL,
    p256dh_key          text NOT NULL,
    auth_secret_encrypted bytea NOT NULL,
    user_agent          text,
    last_used_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, endpoint),
    CONSTRAINT browser_channel_type CHECK (channel_type = 'browser'),
    FOREIGN KEY (channel_id, organization_id, channel_type)
        REFERENCES hawkdot.notification_channels (id, organization_id, channel_type)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.notification_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    monitor_id          uuid,
    name                text NOT NULL,
    enabled             boolean NOT NULL DEFAULT true,
    event_codes         text[] NOT NULL,
    minimum_severity    hawkdot.severity NOT NULL DEFAULT 'warning',
    cooldown_seconds    integer NOT NULL DEFAULT 300,
    notify_recovery     boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id),
    UNIQUE (organization_id, name),
    CONSTRAINT notification_rules_events_not_empty CHECK (cardinality(event_codes) > 0),
    CONSTRAINT notification_rules_cooldown CHECK (cooldown_seconds >= 0),
    FOREIGN KEY (monitor_id, organization_id)
        REFERENCES hawkdot.monitors (id, organization_id)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.notification_rule_channels (
    organization_id     uuid NOT NULL,
    rule_id             uuid NOT NULL,
    channel_id          uuid NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rule_id, channel_id),
    FOREIGN KEY (rule_id, organization_id)
        REFERENCES hawkdot.notification_rules (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (channel_id, organization_id)
        REFERENCES hawkdot.notification_channels (id, organization_id)
        ON DELETE CASCADE
);

CREATE TABLE hawkdot.notification_deliveries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL,
    event_id            uuid NOT NULL,
    rule_id             uuid,
    channel_id          uuid NOT NULL,
    status              hawkdot.notification_delivery_status NOT NULL DEFAULT 'pending',
    attempt_count       smallint NOT NULL DEFAULT 0,
    provider_message_id text,
    last_error          text,
    next_attempt_at     timestamptz,
    sent_at             timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, event_id, channel_id),
    CONSTRAINT notification_attempt_count CHECK (attempt_count BETWEEN 0 AND 20),
    CONSTRAINT notification_sent_consistency CHECK (
        (status = 'sent' AND sent_at IS NOT NULL)
        OR (status <> 'sent' AND sent_at IS NULL)
    ),
    FOREIGN KEY (event_id, organization_id)
        REFERENCES hawkdot.events (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (rule_id, organization_id)
        REFERENCES hawkdot.notification_rules (id, organization_id)
        ON DELETE SET NULL (rule_id),
    FOREIGN KEY (channel_id, organization_id)
        REFERENCES hawkdot.notification_channels (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX notification_deliveries_pending_idx
    ON hawkdot.notification_deliveries (next_attempt_at)
    WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

CREATE TABLE hawkdot.audit_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES hawkdot.organizations(id) ON DELETE CASCADE,
    actor_user_id       uuid REFERENCES hawkdot.users(id) ON DELETE SET NULL,
    action              text NOT NULL,
    entity_type         text NOT NULL,
    entity_id           uuid,
    ip_address          inet,
    user_agent          text,
    before_data         jsonb,
    after_data          jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_before_object CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
    CONSTRAINT audit_after_object CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object')
);

CREATE INDEX audit_logs_org_created_idx
    ON hawkdot.audit_logs (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------------

CREATE FUNCTION hawkdot_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$function$;

DO $triggers$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users',
        'organizations',
        'organization_members',
        'credentials',
        'resources',
        'domain_resources',
        'ip_resources',
        'server_resources',
        'database_resources',
        'endpoint_resources',
        'monitors',
        'server_agents',
        'ssl_monitor_configs',
        'dns_monitor_configs',
        'domain_expiration_monitor_configs',
        'http_monitor_configs',
        'ping_monitor_configs',
        'tcp_monitor_configs',
        'database_monitor_configs',
        'server_agent_monitor_configs',
        'incidents',
        'notification_channels',
        'telegram_channel_configs',
        'browser_push_subscriptions',
        'notification_rules',
        'notification_deliveries'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON hawkdot.%I '
            'FOR EACH ROW EXECUTE FUNCTION hawkdot_private.set_updated_at()',
            table_name
        );
    END LOOP;
END
$triggers$;

-- ---------------------------------------------------------------------------
-- Contexto de tenant e funcoes auxiliares de RLS
-- Em cada transacao da API:
--   SELECT set_config('hawkdot.current_user_id', '<uuid>', true);
--   SELECT set_config('hawkdot.current_organization_id', '<uuid>', true);
-- O terceiro parametro true limita o valor a transacao atual.
-- ---------------------------------------------------------------------------

CREATE FUNCTION hawkdot_private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
    SELECT NULLIF(current_setting('hawkdot.current_user_id', true), '')::uuid
$function$;

CREATE FUNCTION hawkdot_private.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
    SELECT NULLIF(current_setting('hawkdot.current_organization_id', true), '')::uuid
$function$;

CREATE FUNCTION hawkdot_private.is_organization_member(requested_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM hawkdot.organization_members AS member
        WHERE member.organization_id = requested_organization_id
          AND member.user_id = hawkdot_private.current_user_id()
          AND member.status = 'active'::hawkdot.member_status
    )
$function$;

CREATE FUNCTION hawkdot_private.has_organization_role(
    requested_organization_id uuid,
    allowed_roles hawkdot.member_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM hawkdot.organization_members AS member
        WHERE member.organization_id = requested_organization_id
          AND member.user_id = hawkdot_private.current_user_id()
          AND member.status = 'active'::hawkdot.member_status
          AND member.role = ANY (allowed_roles)
    )
$function$;

CREATE FUNCTION hawkdot_private.organization_has_members(requested_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM hawkdot.organization_members AS member
        WHERE member.organization_id = requested_organization_id
    )
$function$;

-- Lookup de login por e-mail (issue #12, M3). No momento do login ainda nao
-- existe hawkdot.current_user_id definido -- a policy users_self_select
-- (id = current_user_id()) bloquearia qualquer busca por e-mail. Esta funcao
-- roda com SECURITY DEFINER e row_security desligado, e devolve so o minimo
-- necessario para autenticar: nunca dados de perfil do usuario.
CREATE FUNCTION hawkdot_private.find_login_credentials(p_email citext)
RETURNS TABLE (id uuid, password_hash text, status hawkdot.user_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT u.id, u.password_hash, u.status
    FROM hawkdot.users AS u
    WHERE u.email = p_email
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hawkdot_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hawkdot_private.current_user_id() TO hawkdot_app;
GRANT EXECUTE ON FUNCTION hawkdot_private.current_organization_id() TO hawkdot_app, hawkdot_worker;
GRANT EXECUTE ON FUNCTION hawkdot_private.is_organization_member(uuid) TO hawkdot_app;
GRANT EXECUTE ON FUNCTION hawkdot_private.has_organization_role(uuid, hawkdot.member_role[]) TO hawkdot_app;
GRANT EXECUTE ON FUNCTION hawkdot_private.organization_has_members(uuid) TO hawkdot_app;
GRANT EXECUTE ON FUNCTION hawkdot_private.find_login_credentials(citext) TO hawkdot_app;

-- Lookup das organizacoes ativas do usuario (issue #15, reaproveitada no
-- #17 /me). members_select exige organization_id = current_organization_id()
-- -- ou seja, so enxerga membership de uma org que a aplicacao ja saiba de
-- antemao. No login, e exatamente o organization_id que ainda nao se sabe
-- (e o que esta funcao existe para descobrir); no /me, o objetivo e listar
-- TODAS as organizacoes do usuario, nao so a ativa -- e organizations_member_select
-- tem a mesma restricao (so enxerga a organizacao ativa), entao name/slug de
-- uma organizacao que nao e a ativa tambem ficariam invisiveis numa query
-- comum dentro do tx. Por isso a funcao ja faz o JOIN com organizations
-- aqui dentro (SECURITY DEFINER, row_security off), em vez do chamador
-- precisar de uma segunda consulta por organizacao.
CREATE FUNCTION hawkdot_private.find_active_organization_memberships(p_user_id uuid)
RETURNS TABLE (
    organization_id uuid,
    organization_name text,
    organization_slug citext,
    role hawkdot.member_role,
    joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT m.organization_id, o.name, o.slug, m.role, m.joined_at
    FROM hawkdot.organization_members AS m
    JOIN hawkdot.organizations AS o ON o.id = m.organization_id
    WHERE m.user_id = p_user_id
      AND m.status = 'active'::hawkdot.member_status
    ORDER BY m.joined_at ASC
$function$;

GRANT EXECUTE ON FUNCTION hawkdot_private.find_active_organization_memberships(uuid) TO hawkdot_app;

-- Listagem de membros da organizacao ativa, com nome/e-mail do usuario
-- (issue #22). users_self_select so permite ao usuario ver A SI MESMO --
-- um JOIN comum dentro do tx nunca traria nome/email dos outros membros.
-- Mesmo padrao das funcoes anteriores: SECURITY DEFINER, row_security off.
-- Diferente delas, esta NAO recebe organization_id por parametro -- usa
-- current_organization_id() diretamente e reconfirma is_organization_member()
-- por dentro, para que so funcione quando chamada de dentro de um
-- withTenant() com a organizacao certa ja definida (nunca um id arbitrario
-- vindo do cliente).
CREATE FUNCTION hawkdot_private.list_organization_members(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (
    user_id uuid,
    email citext,
    display_name text,
    role hawkdot.member_role,
    status hawkdot.member_status,
    joined_at timestamptz,
    invited_by uuid,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT u.id, u.email, u.display_name, m.role, m.status, m.joined_at, m.invited_by, m.created_at
    FROM hawkdot.organization_members AS m
    JOIN hawkdot.users AS u ON u.id = m.user_id
    WHERE m.organization_id = hawkdot_private.current_organization_id()
      AND hawkdot_private.is_organization_member(hawkdot_private.current_organization_id())
    ORDER BY m.created_at ASC
    LIMIT p_limit OFFSET p_offset
$function$;

CREATE FUNCTION hawkdot_private.count_organization_members()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT count(*)
    FROM hawkdot.organization_members AS m
    WHERE m.organization_id = hawkdot_private.current_organization_id()
      AND hawkdot_private.is_organization_member(hawkdot_private.current_organization_id())
$function$;

GRANT EXECUTE ON FUNCTION hawkdot_private.list_organization_members(integer, integer) TO hawkdot_app;
GRANT EXECUTE ON FUNCTION hawkdot_private.count_organization_members() TO hawkdot_app;

-- Lookup de user_id por e-mail para convite de membro (issue #23).
-- members_insert so precisa do user_id do convidado -- devolve so isso,
-- nunca password_hash ou outro dado do usuario alheio.
CREATE FUNCTION hawkdot_private.find_user_id_by_email(p_email citext)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    SELECT u.id FROM hawkdot.users AS u WHERE u.email = p_email
$function$;

GRANT EXECUTE ON FUNCTION hawkdot_private.find_user_id_by_email(citext) TO hawkdot_app;

-- Reserva de monitores vencidos para o scheduler do worker (issue #34).
-- Categoria DIFERENTE das funcoes SECURITY DEFINER anteriores desta secao:
-- aquelas existem porque o chamador ainda nao sabe seu proprio
-- user_id/organization_id. Esta existe porque o AGENDADOR precisa enxergar
-- monitores de TODAS as organizacoes ao mesmo tempo -- e o worker so
-- consegue contexto de UMA organizacao por vez (tenant_worker_isolation
-- exige organization_id = current_organization_id()). Sem esta funcao nao
-- haveria como descobrir quais organizacoes tem trabalho pendente.
--
-- SELECT ... FOR UPDATE SKIP LOCKED na subquery: cada chamada concorrente
-- pega um lote diferente de monitores sem esperar o lock de outra (padrao
-- de fila em Postgres). next_check_at avanca NO MESMO UPDATE que reserva --
-- antes do check rodar, nao depois -- para que uma execucao lenta no worker
-- A nao faca o worker B repetir o mesmo monitor no proximo tick.
CREATE FUNCTION hawkdot_private.reserve_due_monitors(p_limit integer DEFAULT 50)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    resource_id uuid,
    monitor_type hawkdot.monitor_type,
    interval_seconds integer,
    timeout_seconds integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    UPDATE hawkdot.monitors AS m
    SET next_check_at = now() + make_interval(secs => m.interval_seconds)
    FROM (
        SELECT due.id
        FROM hawkdot.monitors AS due
        WHERE due.status = 'active'::hawkdot.monitor_status
          AND due.execution_mode = 'interval'::hawkdot.execution_mode
          AND due.next_check_at <= now()
        ORDER BY due.next_check_at
        FOR UPDATE OF due SKIP LOCKED
        LIMIT p_limit
    ) AS reserved
    WHERE m.id = reserved.id
    RETURNING m.id, m.organization_id, m.resource_id, m.monitor_type, m.interval_seconds, m.timeout_seconds
$function$;

GRANT EXECUTE ON FUNCTION hawkdot_private.reserve_due_monitors(integer) TO hawkdot_worker;

-- Aceite do proprio convite (issue #24): members_update exige owner/admin
-- do ATOR, mas quem aceita ainda nao tem papel nenhum -- o terceiro
-- conflito desse tipo na milestone (depois do login e do /me).
--
-- Uma policy adicional permitindo a propria transicao invited->active FOI
-- tentada primeiro e NAO funciona: Postgres exige, para UPDATE/DELETE, que a
-- linha tambem passe por uma policy de SELECT (implicitamente ANDada as
-- policies de UPDATE, nao so OR'd entre si) -- confirmado com EXPLAIN
-- contra o banco real, que mostrou hawkdot_private.is_organization_member(...)
-- aparecendo no filtro mesmo com uma policy de UPDATE dedicada. E exatamente
-- essa condicao que ainda nao vale nesse momento (o convite ainda esta
-- 'invited'), entao a linha nunca fica visivel o suficiente para a propria
-- UPDATE -- o mesmo tipo de vazio circular do bootstrap do signup, só que
-- surgindo de um mecanismo do Postgres nao documentado nos outros
-- comentarios deste arquivo.
--
-- Solucao: SECURITY DEFINER com row_security off, no mesmo padrao das
-- outras funcoes desta secao -- ignora RLS por completo para esta unica
-- operacao. Usa current_user_id() por dentro (nao um parametro), entao so
-- pode aceitar o proprio convite de quem esta chamando: nao ha como
-- falsificar aceitando em nome de outro usuario. Devolve zero linhas se o
-- convite nao existir, nao pertencer ao usuario, ou ja nao estiver mais
-- 'invited' -- a aplicacao trata isso como 404.
CREATE FUNCTION hawkdot_private.accept_own_invite(p_organization_id uuid)
RETURNS TABLE (organization_id uuid, role hawkdot.member_role, status hawkdot.member_status, joined_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, hawkdot
SET row_security = off
AS $function$
    UPDATE hawkdot.organization_members
    SET status = 'active', joined_at = now()
    WHERE organization_id = p_organization_id
      AND user_id = hawkdot_private.current_user_id()
      AND status = 'invited'::hawkdot.member_status
    RETURNING organization_id, role, status, joined_at
$function$;

GRANT EXECUTE ON FUNCTION hawkdot_private.accept_own_invite(uuid) TO hawkdot_app;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE hawkdot.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hawkdot.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hawkdot.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_select
    ON hawkdot.users FOR SELECT TO hawkdot_app
    USING (id = hawkdot_private.current_user_id());

CREATE POLICY users_self_insert
    ON hawkdot.users FOR INSERT TO hawkdot_app
    WITH CHECK (id = hawkdot_private.current_user_id());

CREATE POLICY users_self_update
    ON hawkdot.users FOR UPDATE TO hawkdot_app
    USING (id = hawkdot_private.current_user_id())
    WITH CHECK (id = hawkdot_private.current_user_id());

CREATE POLICY organizations_member_select
    ON hawkdot.organizations FOR SELECT TO hawkdot_app
    USING (
        id = hawkdot_private.current_organization_id()
        AND hawkdot_private.is_organization_member(id)
    );

CREATE POLICY organizations_self_create
    ON hawkdot.organizations FOR INSERT TO hawkdot_app
    WITH CHECK (
        id = hawkdot_private.current_organization_id()
        AND hawkdot_private.current_user_id() IS NOT NULL
    );

CREATE POLICY organizations_admin_update
    ON hawkdot.organizations FOR UPDATE TO hawkdot_app
    USING (
        id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    )
    WITH CHECK (id = hawkdot_private.current_organization_id());

CREATE POLICY organizations_worker_select
    ON hawkdot.organizations FOR SELECT TO hawkdot_worker
    USING (id = hawkdot_private.current_organization_id());

CREATE POLICY members_select
    ON hawkdot.organization_members FOR SELECT TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.is_organization_member(organization_id)
    );

CREATE POLICY members_insert
    ON hawkdot.organization_members FOR INSERT TO hawkdot_app
    WITH CHECK (
        organization_id = hawkdot_private.current_organization_id()
        AND (
            hawkdot_private.has_organization_role(
                organization_id,
                ARRAY['owner', 'admin']::hawkdot.member_role[]
            )
            OR (
                user_id = hawkdot_private.current_user_id()
                AND role = 'owner'
                AND status = 'active'
                AND NOT hawkdot_private.organization_has_members(organization_id)
            )
        )
    );

CREATE POLICY members_update
    ON hawkdot.organization_members FOR UPDATE TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            organization_id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    )
    WITH CHECK (organization_id = hawkdot_private.current_organization_id());

CREATE POLICY members_delete
    ON hawkdot.organization_members FOR DELETE TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            organization_id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    );

DO $tenant_rls$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'resources',
        'domain_resources',
        'ip_resources',
        'server_resources',
        'database_resources',
        'endpoint_resources',
        'monitors',
        'server_agents',
        'ssl_monitor_configs',
        'dns_monitor_configs',
        'domain_expiration_monitor_configs',
        'http_monitor_configs',
        'ping_monitor_configs',
        'tcp_monitor_configs',
        'database_monitor_configs',
        'server_agent_monitor_configs',
        'monitor_executions',
        'incidents',
        'events',
        'notification_channels',
        'telegram_channel_configs',
        'notification_rules',
        'notification_rule_channels',
        'notification_deliveries'
    ]
    LOOP
        EXECUTE format('ALTER TABLE hawkdot.%I ENABLE ROW LEVEL SECURITY', table_name);

        EXECUTE format(
            'CREATE POLICY tenant_app_select ON hawkdot.%I '
            'FOR SELECT TO hawkdot_app '
            'USING ('
            '  organization_id = hawkdot_private.current_organization_id() '
            '  AND hawkdot_private.is_organization_member(organization_id)'
            ')',
            table_name
        );

        EXECUTE format(
            'CREATE POLICY tenant_app_insert ON hawkdot.%I '
            'FOR INSERT TO hawkdot_app '
            'WITH CHECK ('
            '  organization_id = hawkdot_private.current_organization_id() '
            '  AND hawkdot_private.has_organization_role('
            '    organization_id, '
            '    ARRAY[''owner'', ''admin'', ''operator'']::hawkdot.member_role[]'
            '  )'
            ')',
            table_name
        );

        EXECUTE format(
            'CREATE POLICY tenant_app_update ON hawkdot.%I '
            'FOR UPDATE TO hawkdot_app '
            'USING ('
            '  organization_id = hawkdot_private.current_organization_id() '
            '  AND hawkdot_private.has_organization_role('
            '    organization_id, '
            '    ARRAY[''owner'', ''admin'', ''operator'']::hawkdot.member_role[]'
            '  )'
            ') '
            'WITH CHECK ('
            '  organization_id = hawkdot_private.current_organization_id() '
            '  AND hawkdot_private.has_organization_role('
            '    organization_id, '
            '    ARRAY[''owner'', ''admin'', ''operator'']::hawkdot.member_role[]'
            '  )'
            ')',
            table_name
        );

        EXECUTE format(
            'CREATE POLICY tenant_app_delete ON hawkdot.%I '
            'FOR DELETE TO hawkdot_app '
            'USING ('
            '  organization_id = hawkdot_private.current_organization_id() '
            '  AND hawkdot_private.has_organization_role('
            '    organization_id, '
            '    ARRAY[''owner'', ''admin'', ''operator'']::hawkdot.member_role[]'
            '  )'
            ')',
            table_name
        );

        EXECUTE format(
            'CREATE POLICY tenant_worker_isolation ON hawkdot.%I '
            'FOR ALL TO hawkdot_worker '
            'USING (organization_id = hawkdot_private.current_organization_id()) '
            'WITH CHECK (organization_id = hawkdot_private.current_organization_id())',
            table_name
        );
    END LOOP;
END
$tenant_rls$;

-- Politicas mais restritivas para segredos, inscricoes pessoais e auditoria.

ALTER TABLE hawkdot.credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY credentials_admin_access
    ON hawkdot.credentials FOR ALL TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            organization_id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    )
    WITH CHECK (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            organization_id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    );

CREATE POLICY credentials_worker_access
    ON hawkdot.credentials FOR ALL TO hawkdot_worker
    USING (organization_id = hawkdot_private.current_organization_id())
    WITH CHECK (organization_id = hawkdot_private.current_organization_id());

ALTER TABLE hawkdot.browser_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY browser_subscriptions_owner_access
    ON hawkdot.browser_push_subscriptions FOR ALL TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND user_id = hawkdot_private.current_user_id()
        AND hawkdot_private.is_organization_member(organization_id)
    )
    WITH CHECK (
        organization_id = hawkdot_private.current_organization_id()
        AND user_id = hawkdot_private.current_user_id()
        AND hawkdot_private.is_organization_member(organization_id)
    );

CREATE POLICY browser_subscriptions_worker_access
    ON hawkdot.browser_push_subscriptions FOR ALL TO hawkdot_worker
    USING (organization_id = hawkdot_private.current_organization_id())
    WITH CHECK (organization_id = hawkdot_private.current_organization_id());

ALTER TABLE hawkdot.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_admin_select
    ON hawkdot.audit_logs FOR SELECT TO hawkdot_app
    USING (
        organization_id = hawkdot_private.current_organization_id()
        AND hawkdot_private.has_organization_role(
            organization_id,
            ARRAY['owner', 'admin']::hawkdot.member_role[]
        )
    );

CREATE POLICY audit_logs_member_insert
    ON hawkdot.audit_logs FOR INSERT TO hawkdot_app
    WITH CHECK (
        organization_id = hawkdot_private.current_organization_id()
        AND actor_user_id = hawkdot_private.current_user_id()
        AND hawkdot_private.is_organization_member(organization_id)
    );

CREATE POLICY audit_logs_worker_insert
    ON hawkdot.audit_logs FOR INSERT TO hawkdot_worker
    WITH CHECK (
        organization_id = hawkdot_private.current_organization_id()
        AND actor_user_id IS NULL
    );

-- ---------------------------------------------------------------------------
-- Permissoes da API e do worker
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON hawkdot.users TO hawkdot_app;
GRANT SELECT, INSERT, UPDATE ON hawkdot.organizations TO hawkdot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hawkdot.organization_members TO hawkdot_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    hawkdot.credentials,
    hawkdot.resources,
    hawkdot.domain_resources,
    hawkdot.ip_resources,
    hawkdot.server_resources,
    hawkdot.database_resources,
    hawkdot.endpoint_resources,
    hawkdot.monitors,
    hawkdot.server_agents,
    hawkdot.ssl_monitor_configs,
    hawkdot.dns_monitor_configs,
    hawkdot.domain_expiration_monitor_configs,
    hawkdot.http_monitor_configs,
    hawkdot.ping_monitor_configs,
    hawkdot.tcp_monitor_configs,
    hawkdot.database_monitor_configs,
    hawkdot.server_agent_monitor_configs,
    hawkdot.notification_channels,
    hawkdot.telegram_channel_configs,
    hawkdot.browser_push_subscriptions,
    hawkdot.notification_rules,
    hawkdot.notification_rule_channels
TO hawkdot_app;

GRANT SELECT ON
    hawkdot.monitor_executions,
    hawkdot.events
TO hawkdot_app;

-- #41: o motor de entrega roda com o role da API (hawkdot_app), dentro do
-- withTenant() do usuario/organizacao dona do evento -- o worker
-- (hawkdot_worker) nao tem GRANT em notification_rules/notification_channels
-- de proposito (#38: so emite eventos), entao quem casa evento -> regra ->
-- canal e cria a entrega tem que ser o role da API. UPDATE fica de fora --
-- a mudanca de status (pending -> sent/failed) e responsabilidade do
-- adapter de entrega (#42), nao desta grant.
GRANT SELECT, INSERT ON hawkdot.notification_deliveries TO hawkdot_app;

GRANT SELECT, UPDATE ON hawkdot.incidents TO hawkdot_app;
GRANT SELECT, INSERT ON hawkdot.audit_logs TO hawkdot_app;

GRANT SELECT ON
    hawkdot.organizations,
    hawkdot.resources,
    hawkdot.domain_resources,
    hawkdot.ip_resources,
    hawkdot.server_resources,
    hawkdot.database_resources,
    hawkdot.endpoint_resources,
    hawkdot.credentials,
    hawkdot.ssl_monitor_configs,
    hawkdot.dns_monitor_configs,
    hawkdot.domain_expiration_monitor_configs,
    hawkdot.http_monitor_configs,
    hawkdot.ping_monitor_configs,
    hawkdot.tcp_monitor_configs,
    hawkdot.database_monitor_configs,
    hawkdot.server_agent_monitor_configs,
    hawkdot.notification_channels,
    hawkdot.telegram_channel_configs,
    hawkdot.browser_push_subscriptions,
    hawkdot.notification_rules,
    hawkdot.notification_rule_channels
TO hawkdot_worker;

GRANT SELECT, UPDATE ON
    hawkdot.monitors,
    hawkdot.server_agents
TO hawkdot_worker;

GRANT SELECT, INSERT, UPDATE ON
    hawkdot.monitor_executions,
    hawkdot.incidents,
    hawkdot.notification_deliveries
TO hawkdot_worker;

GRANT SELECT, INSERT ON hawkdot.events TO hawkdot_worker;
GRANT INSERT ON hawkdot.audit_logs TO hawkdot_worker;

-- Evita que futuros objetos recebam acesso implicito de PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA hawkdot REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA hawkdot_private REVOKE ALL ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- ---------------------------------------------------------------------------
-- Exemplo de integracao (nao executado)
-- ---------------------------------------------------------------------------
--
-- 1. Crie logins separados fora desta migration e conceda os papeis:
--      GRANT hawkdot_app TO hawkdot_api_login;
--      GRANT hawkdot_worker TO hawkdot_worker_login;
--
-- 2. Toda operacao da API deve ocorrer em uma transacao:
--      BEGIN;
--      SELECT set_config('hawkdot.current_user_id', :user_id, true);
--      SELECT set_config('hawkdot.current_organization_id', :organization_id, true);
--      -- consultas da requisicao
--      COMMIT;
--
-- 3. O worker tambem deve abrir uma transacao e definir
--    hawkdot.current_organization_id antes de buscar ou gravar dados.
--
-- 4. Para criar a primeira organizacao do usuario, na mesma transacao:
--      - defina current_user_id e o novo current_organization_id;
--      - insira organizations usando esse UUID;
--      - insira organization_members com o proprio usuario, role owner,
--        status active e joined_at preenchido.
