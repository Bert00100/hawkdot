import "dotenv/config";
import { workerBasePrisma } from "@/worker/database";
import { reserveDueMonitors } from "@/worker/scheduler.model";
import { executeMonitor } from "@/worker/execute-monitor";

// Loop de polling simples (ver AGENTS.md, "Worker: processo, conexao e
// contexto"). Este arquivo cuida do ciclo de vida do processo: conectar,
// rodar tick() em intervalo, encerrar de forma limpa em SIGINT/SIGTERM.
const POLL_INTERVAL_MS = 15_000;
// Reserva apenas o que cabe no pool, sem expirar reservas numa fila local.
const BATCH_SIZE = 3;

async function tick(): Promise<number> {
    const reservados = await reserveDueMonitors(BATCH_SIZE);

    if (reservados.length === 0) return 0;

    console.log(`[worker] ${reservados.length} monitor(es) reservado(s)`);

    // Cada monitor abre sua propria transacao (withWorkerTenant, dentro de
    // executeMonitor) -- rodar em paralelo nao arrisca misturar contexto de
    // organizacao entre eles.
    const resultados = await Promise.allSettled(reservados.map(executeMonitor));

    resultados.forEach((resultado, index) => {
        if (resultado.status === "rejected") {
            console.error(
                `[worker] falha ao executar monitor ${reservados[index].id}:`,
                resultado.reason instanceof Error ? resultado.reason.name : "Erro de execucao",
            );
        }
    });
    return reservados.length;
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
        try {
            // Drene lotes cheios sem acrescentar 15s de espera por lote.
            // A concorrencia continua limitada a tres checks por vez.
            if (await tick() === BATCH_SIZE) continue;
        } catch (error) {
            console.error("[worker] falha no polling; nova tentativa em 15s:", error instanceof Error ? error.name : "Erro de conexao");
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    await workerBasePrisma.$disconnect();
    console.log("[worker] encerrado.");
}

main().catch((error) => {
    console.error("[worker] erro fatal:", error instanceof Error ? error.name : "Erro de inicializacao");
    process.exit(1);
});
