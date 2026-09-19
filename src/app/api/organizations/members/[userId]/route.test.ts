import { PATCH, DELETE } from "@/app/api/organizations/members/[userId]/route";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { basePrisma } from "@/config/database";
import { cleanDatabase } from "@/test-utils/cleanup";
import { createFullTenant, createMember, createUser } from "@/test-utils/factories";

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await basePrisma.$disconnect();
});

const ctxPara = (userId: string) => ({ params: Promise.resolve({ userId }) });

describe("PATCH /api/organizations/members/[userId]", () => {
    it("owner altera o papel de um membro", async () => {
        const { user: owner, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "viewer" });
        const token = await signSessionToken({ user_id: owner.id, organization_id: organization.id });

        const response = await PATCH(
            new Request("http://localhost/api/organizations/members/x", {
                method: "PATCH",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
                body: JSON.stringify({ role: "operator" }),
            }),
            ctxPara(membro.id),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.role).toBe("operator");
    });
});

describe("DELETE /api/organizations/members/[userId]", () => {
    it("remover o ultimo owner responde 403", async () => {
        const { user: owner, organization } = await createFullTenant();
        const token = await signSessionToken({ user_id: owner.id, organization_id: organization.id });

        const response = await DELETE(
            new Request("http://localhost/api/organizations/members/x", {
                method: "DELETE",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
            }),
            ctxPara(owner.id),
        );

        expect(response.status).toBe(403);
    });

    it("owner remove um membro comum, 200", async () => {
        const { user: owner, organization } = await createFullTenant();
        const membro = await createUser();
        await createMember(organization.id, membro.id, { role: "viewer" });
        const token = await signSessionToken({ user_id: owner.id, organization_id: organization.id });

        const response = await DELETE(
            new Request("http://localhost/api/organizations/members/x", {
                method: "DELETE",
                headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
            }),
            ctxPara(membro.id),
        );

        expect(response.status).toBe(200);
    });
});
