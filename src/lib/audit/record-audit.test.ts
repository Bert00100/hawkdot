import { extractRequestMeta } from "@/lib/audit/record-audit";

describe("extractRequestMeta", () => {
    it("usa o primeiro IP de x-forwarded-for quando presente", () => {
        const request = new Request("http://localhost/api/x", {
            headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "vitest" },
        });

        const meta = extractRequestMeta(request);

        expect(meta.ipAddress).toBe("203.0.113.5");
        expect(meta.userAgent).toBe("vitest");
    });

    it("cai para x-real-ip quando x-forwarded-for esta ausente", () => {
        const request = new Request("http://localhost/api/x", {
            headers: { "x-real-ip": "198.51.100.7" },
        });

        expect(extractRequestMeta(request).ipAddress).toBe("198.51.100.7");
    });

    it("sem nenhum header, ip_address fica ausente (nullable no banco)", () => {
        const request = new Request("http://localhost/api/x");

        const meta = extractRequestMeta(request);

        expect(meta.ipAddress).toBeUndefined();
        expect(meta.userAgent).toBeUndefined();
    });
});
