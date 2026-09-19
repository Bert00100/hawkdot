import "dotenv/config";
import { workerBasePrisma } from "@/worker/database";
import { reserveDueMonitors } from "@/worker/scheduler.model";

// Loop de polling simples (ver AGENTS.md, "Worker: processo, conexao e
// contexto"). Este arquivo cuida do ciclo de vida do processo: conectar,
// rodar tick() em intervalo, encerrar de forma limpa em SIGINT/SIGTERM.
const POLL_INTERVAL_MS = 15_000;
const BATCH_SIZE = 50;

async function tick(): Promise<void> {
    const reservados = await reserveDueMonitors(BATCH_SIZE);

    if (reservados.length === 0) return;

    console.log(`[worker] ${reservados.length} monitor(es) reservado(s)`);
    // Execucao de fato (por organizacao, via withWorkerTenant) entra na
    // #35 -- por enquanto so reserva e loga.
}

async function main(): Promise<void> {
    const { current_user } = (
        await workerBasePrisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`
    )[0];
    console.log(`[worker] conectado como ${current_user}`);

    let running = true;
    const shutdown = () => {
        console.log("[worker] encerrando...");
        running = false;
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (running) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    await workerBasePrisma.$disconnect();
    console.log("[worker] encerrado.");
}

main().catch((error) => {
    console.error("[worker] erro fatal:", error);
    process.exit(1);
});
