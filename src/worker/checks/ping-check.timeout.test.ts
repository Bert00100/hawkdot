import { EventEmitter } from "node:events";
import { runPingCheck } from "@/worker/checks/ping-check";

type ExecFileCallback = (
    error: (Error & { killed: boolean }) | null,
    stdout: string,
    stderr: string,
) => void;

const mockExecFile = jest.fn();

jest.mock("node:child_process", () => ({
    execFile: (...args: unknown[]) => mockExecFile(...args),
}));

describe("runPingCheck: timeout", () => {
    it("retorna timeout quando o processo ping excede o limite", async () => {
        mockExecFile.mockImplementation(
            (
                _file: string,
                _args: string[],
                _options: object,
                callback: ExecFileCallback,
            ) => {
                const child = new EventEmitter();

                queueMicrotask(() => {
                    const error = Object.assign(new Error("Command timed out"), {
                        killed: true,
                    });

                    callback(error, "", "");
                });

                return child;
            },
        );

        const resultado = await runPingCheck(
            {
                host: "127.0.0.1",
                packet_count: 1,
                max_packet_loss_percent: 0,
            },
            2,
        );

        expect(resultado.check_status).toBe("timeout");
        expect(resultado.observed_state).toBe("down");
        expect(resultado.summary).toContain("2s");
        expect(resultado.response_time_ms).toBeGreaterThanOrEqual(0);
    });
});
