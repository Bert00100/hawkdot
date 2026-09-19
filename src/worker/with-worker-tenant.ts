import { workerBasePrisma } from "@/worker/database";

// Wrapper de tenant proprio do worker: define SO
// hawkdot.current_organization_id -- nunca current_user_id, porque o worker
// nao age em nome de um usuario (issue #33). tenant_worker_isolation exige
// so organization_id = current_organization_id(), sem checagem de papel.
export type WorkerTenantClient = Parameters<
    Parameters<typeof workerBasePrisma.$transaction>[0]
>[0];

export async function withWorkerTenant<T>(
    organizationId: string,
    callback: (tx: WorkerTenantClient) => Promise<T>,
): Promise<T> {
    return workerBasePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('hawkdot.current_organization_id', ${organizationId}, true)`;

        return callback(tx);
    });
}
