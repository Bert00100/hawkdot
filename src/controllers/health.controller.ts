import { getDatabaseTimestamp } from "@/models/health.model";
import { serviceUnavailable } from "@/lib/errors";

export type HealthStatus = {
    status: "ok";
    database: "PostgreSQL";
    timestamp: Date;
};

export async function checkDatabaseConnection(): Promise<HealthStatus> {
    try {
        const timestamp = await getDatabaseTimestamp();

        return {
            status: "ok",
            database: "PostgreSQL",
            timestamp,
        };
    } catch (error) {
        // O detalhe da falha de conexao interessa ao log, nao ao cliente.
        console.error("[hawkdot] falha ao consultar o banco no health check:", error);

        throw serviceUnavailable("Banco de dados indisponivel.");
    }
}
