import { runPingCheck } from "@/worker/checks/ping-check";

describe("runPingCheck", () => {
    it("sucesso: host local responde com 0% de perda", async () => {
        const resultado = await runPingCheck(
            { host: "127.0.0.1", packet_count: 1, max_packet_loss_percent: 0 },
            3,
        );

        expect(resultado.check_status).toBe("success");
        expect(resultado.observed_state).toBe("up");
        expect(resultado.details.packet_loss_percent).toBe(0);
    }, 10_000);

    it("falha: perda acima do limite configurado (endereco nao roteavel, sem depender de internet)", async () => {
        // 203.0.113.0/24 e reservado para documentacao (TEST-NET-3, RFC 5737)
        // -- garantido nao roteavel, mas o pacote nao gera erro de rede,
        // so 100% de perda dentro do prazo de espera.
        const resultado = await runPingCheck(
            { host: "203.0.113.1", packet_count: 1, max_packet_loss_percent: 0 },
            2,
        );

        expect(resultado.check_status).toBe("failure");
        expect(resultado.observed_state).toBe("down");
        expect(resultado.details.packet_loss_percent).toBe(100);
    }, 10_000);

    it("sucesso quando a perda fica dentro do limite tolerado", async () => {
        const resultado = await runPingCheck(
            { host: "127.0.0.1", packet_count: 1, max_packet_loss_percent: 100 },
            3,
        );

        expect(resultado.check_status).toBe("success");
    }, 10_000);

    it("error: host que nao resolve via DNS", async () => {
        const resultado = await runPingCheck(
            { host: "host-que-nao-existe.invalid", packet_count: 1, max_packet_loss_percent: 0 },
            2,
        );

        expect(resultado.check_status).toBe("error");
        expect(resultado.observed_state).toBe("down");
    }, 10_000);

});
