import { listAuditLogsController } from "@/controllers/audit-log.controller";
import { createCredentialController } from "@/controllers/credential.controller";
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

describe("listAuditLogsController", () => {
    it("owner le os logs de auditoria gerados por uma acao sensivel, sem nenhum segredo", async () => {
        const { user, organization } = await createFullTenant();
        const session = { userId: user.id, organizationId: organization.id };

        await withTenant(session, (tx) =>
            createCredentialController(tx, session, {
                name: "Bot",
                credential_type: "api_token",
                secret: "token-super-secreto-123",
            }),
        );

        const lista = await withTenant(session, (tx) => listAuditLogsController(tx, session, { page: 1, per_page: 20 }));

        expect(lista.total).toBeGreaterThanOrEqual(1);
        const log = lista.items.find((item) => item.action === "credential.created");
        expect(log).toBeDefined();
        expect(log?.actor_user_id).toBe(user.id);
        expect(JSON.stringify(log)).not.toContain("token-super-secreto-123");
    });

    it.each(["admin", "operator", "viewer"] as const)(
        "%s: admin consegue ler, operator/viewer nao conseguem (403)",
        async (role) => {
            const { organization } = await createFullTenant();
            const membro = await createUser();
            await createMember(organization.id, membro.id, { role });
            const session = { userId: membro.id, organizationId: organization.id };

            const resultado = await withTenant(session, (tx) =>
                listAuditLogsController(tx, session, { page: 1, per_page: 20 }),
            ).catch((e) => e);

            if (role === "admin") {
                expect(resultado).toMatchObject({ page: 1, per_page: 20 });
            } else {
                expect(errorResponse(resultado).status).toBe(403);
            }
        },
    );
});
