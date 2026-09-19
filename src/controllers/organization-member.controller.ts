import type { TenantClient } from "@/lib/tenant/with-tenant";
import type { Session } from "@/lib/auth/require-session";
import type { Paginacao } from "@/lib/dto/common";
import {
    countOrganizationMembers,
    listOrganizationMembers,
} from "@/models/organization-member.model";

export type MemberListResult = {
    items: {
        user_id: string;
        email: string;
        display_name: string;
        role: string;
        status: string;
        joined_at: Date | null;
    }[];
    page: number;
    per_page: number;
    total: number;
};

// Leitura livre para qualquer membro ativo (members_select nao restringe
// por papel) -- nao precisa de requireRole.
export async function listMembers(
    tx: TenantClient,
    _session: Session,
    { page, per_page }: Paginacao,
): Promise<MemberListResult> {
    const offset = (page - 1) * per_page;

    const [members, total] = await Promise.all([
        listOrganizationMembers(tx, { limit: per_page, offset }),
        countOrganizationMembers(tx),
    ]);

    return {
        items: members.map((m) => ({
            user_id: m.user_id,
            email: m.email,
            display_name: m.display_name,
            role: m.role,
            status: m.status,
            joined_at: m.joined_at,
        })),
        page,
        per_page,
        total,
    };
}
