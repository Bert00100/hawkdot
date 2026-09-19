import { createMonitorSchema } from "@/lib/dto/monitor.dto";
import { parseInput } from "@/lib/dto";

const validInput = {
    resource_id: "11111111-1111-4111-8111-111111111111",
    monitor_type: "http",
    name: "Monitor",
    config: { url: "https://exemplo.com/health" },
};

describe("createMonitorSchema", () => {
    it("aceita entrada minima com defaults", () => {
        const dados = parseInput(createMonitorSchema, validInput);

        expect(dados.interval_seconds).toBe(60);
        expect(dados.timeout_seconds).toBe(30);
        expect(dados.failure_threshold).toBe(2);
    });

    it("recusa interval_seconds menor que 10 (monitors_interval_or_continuous)", () => {
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, interval_seconds: 5 }),
        ).toThrow();
    });

    it("recusa timeout_seconds fora de 1..300", () => {
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, timeout_seconds: 301 }),
        ).toThrow();
    });

    it("recusa failure_threshold/recovery_threshold fora de 1..20", () => {
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, failure_threshold: 21 }),
        ).toThrow();
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, recovery_threshold: 0 }),
        ).toThrow();
    });

    it("recusa monitor_type fora do escopo do MVP (ex.: server_agent)", () => {
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, monitor_type: "server_agent" }),
        ).toThrow();
    });

    it("nome vazio e recusado", () => {
        expect(() => parseInput(createMonitorSchema, { ...validInput, name: "   " })).toThrow();
    });

    it("exige config compativel com o monitor_type (http sem url falha)", () => {
        expect(() =>
            parseInput(createMonitorSchema, { ...validInput, config: {} }),
        ).toThrow();
    });
});
