import * as http from "node:http";
import { runCheck } from "@/worker/checks/run-check";

describe("runCheck (registro de executores)", () => {
    it("despacha para o executor http quando monitor_type='http'", async () => {
        const server = http.createServer((_req, res) => res.writeHead(200).end());
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const { port } = server.address() as { port: number };

        const resultado = await runCheck(
            "http",
            {
                url: `http://127.0.0.1:${port}`,
                method: "GET",
                request_headers: {},
                expected_status_min: 200,
                expected_status_max: 299,
                follow_redirects: true,
            },
            2,
        );

        expect(resultado.check_status).toBe("success");

        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("despacha para o executor ping quando monitor_type='ping'", async () => {
        const resultado = await runCheck(
            "ping",
            { host: "127.0.0.1", packet_count: 1, max_packet_loss_percent: 0 },
            3,
        );

        expect(resultado.check_status).toBe("success");
    }, 10_000);
});
