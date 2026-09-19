import { createDomainResourceSchema, createEndpointResourceSchema, createIpResourceSchema } from "@/lib/dto/resource.dto";
import { parseInput } from "@/lib/dto";

describe("createDomainResourceSchema", () => {
    it("recusa FQDN invalido antes de tocar o banco", () => {
        expect(() =>
            parseInput(createDomainResourceSchema, {
                display_name: "X",
                fqdn: "nao e um dominio",
            }),
        ).toThrow();
    });

    it("aceita FQDN valido e normaliza para minusculas", () => {
        const dados = parseInput(createDomainResourceSchema, {
            display_name: "X",
            fqdn: "Exemplo.COM",
        });

        expect(dados.fqdn).toBe("exemplo.com");
    });
});

describe("createEndpointResourceSchema", () => {
    it("URL sem esquema http/https retorna erro de validacao", () => {
        expect(() =>
            parseInput(createEndpointResourceSchema, { display_name: "X", url: "exemplo.com" }),
        ).toThrow();
    });

    it("aceita URL http e https", () => {
        expect(() =>
            parseInput(createEndpointResourceSchema, {
                display_name: "X",
                url: "https://exemplo.com/health",
            }),
        ).not.toThrow();
    });
});

describe("createIpResourceSchema", () => {
    it.each(["192.168.1.1", "::1", "2001:db8::1"])("aceita %p", (address) => {
        expect(() =>
            parseInput(createIpResourceSchema, { display_name: "X", address }),
        ).not.toThrow();
    });

    it.each(["nao-e-ip", "999.999.999.999", ""])("recusa %p", (address) => {
        expect(() =>
            parseInput(createIpResourceSchema, { display_name: "X", address }),
        ).toThrow();
    });
});
