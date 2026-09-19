import { adminClient } from "./admin-client";

// Contador para garantir valores unicos (email e slug tem UNIQUE no banco).
// Reiniciar entre suites nao e problema: o cleanDatabase() esvazia as tabelas.
let seq = 0;
const nextSeq = () => ++seq;

export async function createUser(overrides: {
    email?: string;
    display_name?: string;
    password_hash?: string;
} = {}) {
    const n = nextSeq();

    return adminClient.users.create({
        data: {
            email: `user${n}@teste.hawkdot`,
            display_name: `Usuario Teste ${n}`,
            password_hash: "hash-de-teste",
            ...overrides,
        },
    });
}

export async function createOrganization(overrides: {
    name?: string;
    slug?: string;
} = {}) {
    const n = nextSeq();

    return adminClient.organizations.create({
        data: {
            name: `Organizacao Teste ${n}`,
            slug: `org-teste-${n}`,
            ...overrides,
        },
    });
}

// O CHECK `active_member_has_joined_at` exige joined_at preenchido
// sempre que o status for 'active'.
export async function createMember(
    organizationId: string,
    userId: string,
    overrides: { role?: "owner" | "admin" | "operator" | "viewer" } = {},
) {
    return adminClient.organization_members.create({
        data: {
            organization_id: organizationId,
            user_id: userId,
            role: overrides.role ?? "owner",
            status: "active",
            joined_at: new Date(),
        },
    });
}

export async function createResource(
    organizationId: string,
    overrides: {
        resource_type?: "domain" | "ip" | "server" | "database" | "url_endpoint";
        display_name?: string;
    } = {},
) {
    const n = nextSeq();

    return adminClient.resources.create({
        data: {
            organization_id: organizationId,
            resource_type: overrides.resource_type ?? "domain",
            display_name: overrides.display_name ?? `Recurso Teste ${n}`,
        },
    });
}

// O CHECK `monitors_interval_or_continuous` exige interval_seconds >= 10
// quando execution_mode e 'interval' (o padrao).
export async function createMonitor(
    organizationId: string,
    resourceId: string,
    overrides: {
        monitor_type?: "ssl" | "http" | "ping";
        name?: string;
        interval_seconds?: number;
    } = {},
) {
    const n = nextSeq();

    return adminClient.monitors.create({
        data: {
            organization_id: organizationId,
            resource_id: resourceId,
            monitor_type: overrides.monitor_type ?? "http",
            name: overrides.name ?? `Monitor Teste ${n}`,
            interval_seconds: overrides.interval_seconds ?? 60,
        },
    });
}

// Monta a cadeia completa de uma vez: user -> organization -> member (owner)
// -> resource -> monitor. Retorna todos os registros criados.
export async function createFullTenant() {
    const user = await createUser();
    const organization = await createOrganization();
    const member = await createMember(organization.id, user.id);
    const resource = await createResource(organization.id);
    const monitor = await createMonitor(organization.id, resource.id);

    return { user, organization, member, resource, monitor };
}

export async function createCredential(
    organizationId: string,
    overrides: { name?: string } = {},
) {
    const n = nextSeq();

    return adminClient.credentials.create({
        data: {
            organization_id: organizationId,
            name: overrides.name ?? `Credencial Teste ${n}`,
            credential_type: "api_token",
            secret_reference: `secret-ref-${n}`,
        },
    });
}

// O canal 'browser' precisa existir antes da inscricao (FK composta
// channel_id+organization_id+channel_type).
export async function createBrowserNotificationChannel(organizationId: string) {
    const n = nextSeq();

    return adminClient.notification_channels.create({
        data: {
            organization_id: organizationId,
            channel_type: "browser",
            name: `Canal Browser Teste ${n}`,
        },
    });
}

export async function createBrowserPushSubscription(
    organizationId: string,
    userId: string,
    overrides: { channelId?: string } = {},
) {
    const n = nextSeq();
    const channelId =
        overrides.channelId ?? (await createBrowserNotificationChannel(organizationId)).id;

    return adminClient.browser_push_subscriptions.create({
        data: {
            organization_id: organizationId,
            channel_id: channelId,
            channel_type: "browser",
            user_id: userId,
            endpoint: `https://push.exemplo.test/${n}`,
            p256dh_key: `p256dh-${n}`,
            auth_secret_encrypted: Buffer.from(`segredo-${n}`),
        },
    });
}
