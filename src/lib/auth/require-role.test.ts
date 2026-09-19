import { requireRole } from "@/lib/auth/require-role";
import { withTenant } from "@/lib/tenant/with-tenant";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { adminClient } from "@/test-utils/admin-client";
import { createMember, createOrganization, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

describe("requireRole", () => {
    it.each(["owner", "admin", "operator", "viewer"] as const)(
        "devolve o papel quando %s esta na lista permitida",
        async (role) => {
            const user = await createUser();
            const organization = await createOrganization();
            await createMember(organization.id, user.id, { role });

            const resultado = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
                requireRole(tx, { userId: user.id, organizationId: organization.id }, [role]),
            );

            expect(resultado).toBe(role);
        },
    );

    it.each(["operator", "viewer"] as const)(
        "%s tentando uma acao restrita a owner/admin recebe 403, nao erro de banco",
        async (role) => {
            const user = await createUser();
            const organization = await createOrganization();
            await createMember(organization.id, user.id, { role });

            const erro = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
                requireRole(tx, { userId: user.id, organizationId: organization.id }, ["owner", "admin"]),
            ).catch((e) => e);

            expect(erro).toMatchObject({ status: 403, code: "FORBIDDEN" });
        },
    );

    it("membro com status diferente de active e recusado mesmo com papel permitido", async () => {
        const user = await createUser();
        const organization = await createOrganization();
        await adminClient.organization_members.create({
            data: { organization_id: organization.id, user_id: user.id, role: "owner", status: "suspended" },
        });

        const erro = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            requireRole(tx, { userId: user.id, organizationId: organization.id }, ["owner"]),
        ).catch((e) => e);

        expect(erro).toMatchObject({ status: 403 });
    });

    it("usuario que nao e membro nenhum e recusado", async () => {
        const user = await createUser();
        const organization = await createOrganization();

        const erro = await withTenant({ userId: user.id, organizationId: organization.id }, (tx) =>
            requireRole(tx, { userId: user.id, organizationId: organization.id }, ["owner", "admin", "operator", "viewer"]),
        ).catch((e) => e);

        expect(erro).toMatchObject({ status: 403 });
    });
});
