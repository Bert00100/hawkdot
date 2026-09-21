import { z } from "zod";
import * as dto from "@/lib/dto/common";

// Campos comuns de hawkdot.resources (issue #26). display_name espelha
// resources_name_not_blank; environment vem do enum do banco.
const commonFields = {
    display_name: dto.nomeObrigatorio("O nome"),
    environment: z.enum(["production", "staging", "development", "other"]).default("production"),
};

// domain_fqdn_format ja e a primitiva dto.fqdn.
export const createDomainResourceSchema = z.object({
    ...commonFields,
    fqdn: dto.fqdn,
});
export const updateDomainResourceSchema = z
    .object({
        display_name: commonFields.display_name,
        environment: z.enum(["production", "staging", "development", "other"]),
        fqdn: dto.fqdn,
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

// endpoint_url_http ja e a primitiva dto.httpUrl. Decisao documentada
// (issue #28): nao normalizar a URL automaticamente (barra final, caixa do
// host) -- url e text (case-sensitive) e o CHECK so exige o esquema
// http(s). Normalizar silenciosamente poderia salvar algo diferente do que
// o usuario digitou (ex.: um path com maiusculas que faz parte da rota).
// Duplicata com barra final ou caixa diferente vira dois recursos --
// aceito pelo MVP, revisitar se virar problema real.
export const createEndpointResourceSchema = z.object({
    ...commonFields,
    url: dto.httpUrl,
});
export const updateEndpointResourceSchema = z
    .object({
        display_name: commonFields.display_name,
        environment: z.enum(["production", "staging", "development", "other"]),
        url: dto.httpUrl,
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export const createIpResourceSchema = z.object({
    ...commonFields,
    address: dto.ipAddress,
});
export const updateIpResourceSchema = z
    .object({
        display_name: commonFields.display_name,
        environment: z.enum(["production", "staging", "development", "other"]),
        address: dto.ipAddress,
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type CreateDomainResourceInput = z.infer<typeof createDomainResourceSchema>;
export type UpdateDomainResourceInput = z.infer<typeof updateDomainResourceSchema>;
export type CreateEndpointResourceInput = z.infer<typeof createEndpointResourceSchema>;
export type UpdateEndpointResourceInput = z.infer<typeof updateEndpointResourceSchema>;
export type CreateIpResourceInput = z.infer<typeof createIpResourceSchema>;
export type UpdateIpResourceInput = z.infer<typeof updateIpResourceSchema>;

// Listagem paginada e filtrada (#32).
export const listResourcesQuerySchema = dto.paginacao.extend({
    q: dto.nomeObrigatorio("A busca").optional(),
    resource_type: z.enum(["domain", "ip", "url_endpoint"]).optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    environment: z.enum(["production", "staging", "development", "other"]).optional(),
});

export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
