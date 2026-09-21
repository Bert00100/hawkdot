import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, testDatabaseUrls } from "@/config/env";

// Ambiente isolado: nem o Next nem o worker de QA tocam o banco de uso local.
const urls = testDatabaseUrls();
for (const url of [urls.app, urls.admin, env.DATABASE_URL_WORKER_TEST]) {
    if (!url || new URL(url).pathname !== "/hawkdot_test" || url === env.DATABASE_URL) {
        throw new Error("E2E exige URLs separadas para hawkdot_test.");
    }
}
const certPath = resolve("src/worker/checks/fixtures/localhost-cert.pem");
const server = createServer({
    cert: readFileSync(certPath), key: readFileSync("src/worker/checks/fixtures/localhost-key.pem"),
}, (req, res) => {
    if (req.url === "/slow") setTimeout(() => res.writeHead(200).end("ok"), 6000);
    else if (req.url === "/down") res.writeHead(503).end("unavailable");
    else res.writeHead(200).end("ok");
});
server.listen(3443, "127.0.0.1");
const childEnv: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])), NODE_ENV: "development" };
Object.assign(childEnv, {
    NODE_ENV: "development", DATABASE_URL: urls.app, DATABASE_URL_WORKER: env.DATABASE_URL_WORKER_TEST,
    NEXT_DIST_DIR: ".next-e2e", NODE_EXTRA_CA_CERTS: certPath,
    PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
});
const children = [
    spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], { env: childEnv, stdio: "inherit" }),
    spawn(process.execPath, ["--import", "tsx", "src/worker/run.ts"], { env: childEnv, stdio: "inherit" }),
];
let stopping = false;
function stop() {
    if (stopping) return;
    stopping = true;
    children.forEach((child) => child.kill("SIGTERM"));
    server.close();
    // Worker pode estar no intervalo de polling; deixe encerrar normalmente.
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", () => { if (!stopping) stop(); }));
