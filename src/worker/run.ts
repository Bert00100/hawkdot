import "dotenv/config";
import { workerBasePrisma } from "@/worker/database";

// Loop de polling simples (ver AGENTS.md, "Worker: processo, conexao e
// contexto"). A logica de scheduling em si entra na issue #34 -- este
// arquivo so cuida do ciclo de vida do processo: conectar, rodar tick() em
// intervalo, encerrar de forma limpa em SIGINT/SIGTERM.
const POLL_INTERVAL_MS = 15_000;

async function tick(): Promise<void> {
    // Placeholder ate a #34 implementar o scheduler de verdade.
    console.log("[worker] tick");
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
