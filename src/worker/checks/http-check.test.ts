import * as http from "node:http";
import { runHttpCheck } from "@/worker/checks/http-check";
import type { HttpCheckConfig } from "@/worker/checks/http-check";

const baseConfig: HttpCheckConfig = {
    url: "",
    method: "GET",
    request_headers: {},
    expected_status_min: 200,
    expected_status_max: 299,
    follow_redirects: true,
};

function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as { port: number };
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

describe("runHttpCheck", () => {
    it("sucesso: status dentro da faixa esperada", async () => {
        const server = await startServer((_req, res) => res.writeHead(200).end("ok"));

        const resultado = await runHttpCheck({ ...baseConfig, url: server.url }, 2);

        expect(resultado.check_status).toBe("success");
        expect(resultado.observed_state).toBe("up");
        expect(resultado.response_time_ms).toBeGreaterThanOrEqual(0);

        await server.close();
    });

    it("falha: status fora da faixa esperada (nao lanca, devolve resultado)", async () => {
        const server = await startServer((_req, res) => res.writeHead(500).end("erro"));

        const resultado = await runHttpCheck({ ...baseConfig, url: server.url }, 2);

        expect(resultado.check_status).toBe("failure");
        expect(resultado.observed_state).toBe("down");

        await server.close();
    });

    it("falha: expected_body_contains nao encontrado no corpo", async () => {
        const server = await startServer((_req, res) => res.writeHead(200).end("corpo qualquer"));

        const resultado = await runHttpCheck(
            { ...baseConfig, url: server.url, expected_body_contains: "esperado" },
            2,
        );

        expect(resultado.check_status).toBe("failure");

        await server.close();
    });

    it("sucesso: expected_body_contains encontrado", async () => {
        const server = await startServer((_req, res) => res.writeHead(200).end("tudo esperado aqui"));

        const resultado = await runHttpCheck(
            { ...baseConfig, url: server.url, expected_body_contains: "esperado" },
            2,
        );

        expect(resultado.check_status).toBe("success");

        await server.close();
    });

    it("timeout: servidor nao responde dentro do prazo -- vira 'timeout', nao 'error'", async () => {
        const server = await startServer(() => {
            // Aceita a conexao, mas nao envia nem encerra a resposta. O
            // executor precisa interromper a requisicao pelo timeout.
        });

        try {
            const resultado = await runHttpCheck({ ...baseConfig, url: server.url }, 1);

            expect(resultado.check_status).toBe("timeout");
            expect(resultado.observed_state).toBe("down");
            expect(resultado.summary).toContain("1s");
            expect(resultado.response_time_ms).not.toBeNull();
            expect(resultado.response_time_ms).toBeGreaterThanOrEqual(900);
            expect(resultado.response_time_ms).toBeLessThan(2_500);
        } finally {
            await server.close();
        }
    }, 10_000);

    it("error: host inexistente -- nao lanca, devolve check_status 'error'", async () => {
        const resultado = await runHttpCheck(
            { ...baseConfig, url: "http://host-que-nao-existe.invalid" },
            2,
        );

        expect(resultado.check_status).toBe("error");
        expect(resultado.observed_state).toBe("down");
    });

    it("envia os headers e o metodo configurados", async () => {
        let recebeu: http.IncomingMessage | undefined;
        const server = await startServer((req, res) => {
            recebeu = req;
            res.writeHead(200).end();
        });

        await runHttpCheck(
            { ...baseConfig, url: server.url, method: "GET", request_headers: { "x-custom": "valor" } },
            2,
        );

        expect(recebeu?.headers["x-custom"]).toBe("valor");

        await server.close();
    });
});
