import { readFileSync } from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import * as tls from "node:tls";
import { runSslCheck, type SslCheckConfig } from "@/worker/checks/ssl-check";

const fixturesDirectory = path.join(process.cwd(), "src/worker/checks/fixtures");
const key = readFileSync(path.join(fixturesDirectory, "localhost-key.pem"));
const cert = readFileSync(path.join(fixturesDirectory, "localhost-cert.pem"));
const openSockets = new WeakMap<net.Server, Set<net.Socket>>();

const baseConfig: SslCheckConfig = {
    hostname: "127.0.0.1",
    port: 0,
    sni_name: "localhost",
    verify_chain: false,
    verify_hostname: true,
    warning_days: [1],
};

function listen(server: net.Server): Promise<number> {
    return new Promise((resolve) => {
        const sockets = new Set<net.Socket>();
        openSockets.set(server, sockets);
        server.on("connection", (socket) => {
            sockets.add(socket);
            socket.once("close", () => sockets.delete(socket));
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Nao foi possivel obter a porta do servidor de teste.");
            }
            resolve(address.port);
        });
    });
}

function close(server: net.Server): Promise<void> {
    return new Promise((resolve, reject) => {
        for (const socket of openSockets.get(server) ?? []) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

describe("runSslCheck", () => {
    it("conecta ao servidor TLS local e extrai validade e cadeia", async () => {
        let receivedServername: string | undefined;
        const secureContext = tls.createSecureContext({ key, cert });
        const server = tls.createServer({
            key,
            cert,
            SNICallback: (servername, callback) => {
                receivedServername = servername;
                callback(null, secureContext);
            },
        });
        const port = await listen(server);

        try {
            const result = await runSslCheck({ ...baseConfig, port }, 2);

            expect(result.check_status).toBe("success");
            expect(result.observed_state).toBe("up");
            expect(result.response_time_ms).toBeGreaterThanOrEqual(0);
            expect(result.details.days_remaining).toEqual(expect.any(Number));
            expect(result.details.valid_to).toEqual(expect.any(String));
            expect(result.details.certificate_chain).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        subject: expect.objectContaining({ CN: "localhost" }),
                    }),
                ]),
            );
            expect(receivedServername).toBe("localhost");
        } finally {
            await close(server);
        }
    });

    it("marca como degraded quando o certificado atinge warning_days", async () => {
        const server = tls.createServer({ key, cert });
        const port = await listen(server);

        try {
            const result = await runSslCheck(
                { ...baseConfig, port, warning_days: [100_000] },
                2,
            );

            expect(result.check_status).toBe("success");
            expect(result.observed_state).toBe("degraded");
        } finally {
            await close(server);
        }
    });

    it("rejeita certificado autoassinado quando verify_chain esta habilitado", async () => {
        const server = tls.createServer({ key, cert });
        const port = await listen(server);

        try {
            const result = await runSslCheck(
                { ...baseConfig, port, verify_chain: true },
                2,
            );

            expect(result.check_status).toBe("error");
            expect(result.observed_state).toBe("down");
        } finally {
            await close(server);
        }
    });

    it("rejeita hostname diferente quando verify_hostname esta habilitado", async () => {
        const server = tls.createServer({ key, cert });
        const port = await listen(server);

        try {
            const result = await runSslCheck(
                { ...baseConfig, port, sni_name: "outro.exemplo" },
                2,
            );

            expect(result.check_status).toBe("failure");
            expect(result.observed_state).toBe("down");
        } finally {
            await close(server);
        }
    });

    it("retorna timeout quando o servidor nao completa o handshake TLS", async () => {
        const server = net.createServer(() => {
            // Aceita TCP, mas nao responde ao ClientHello do cliente TLS.
        });
        const port = await listen(server);

        try {
            const result = await runSslCheck({ ...baseConfig, port }, 1);

            expect(result.check_status).toBe("timeout");
            expect(result.observed_state).toBe("down");
            expect(result.summary).toContain("1s");
            expect(result.response_time_ms).toBeGreaterThanOrEqual(900);
            expect(result.response_time_ms).toBeLessThan(2_500);
        } finally {
            await close(server);
        }
    }, 10_000);
});
