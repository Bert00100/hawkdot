import { z } from "zod";
import * as dto from "@/lib/dto/common";

// Cada schema espelha os CHECKs da tabela *_monitor_configs correspondente
// (issue #31). O nome do campo aqui bate com a coluna real, para o
// controller poder repassar direto ao model.

// ssl_monitor_port, ssl_warning_days_not_empty
export const sslConfigSchema = z.object({
    hostname: dto.fqdn,
    port: dto.porta.default(443),
    sni_name: z.string().trim().min(1).optional(),
    verify_chain: z.boolean().default(true),
    verify_hostname: z.boolean().default(true),
    warning_days: z
        .array(z.coerce.number().int().positive())
        .min(1, "warning_days nao pode ser uma lista vazia.")
        .default([30, 14, 7, 3, 1]),
});
export type SslConfigInput = z.infer<typeof sslConfigSchema>;

// http_monitor_url, http_monitor_method, http_monitor_headers_object,
// http_monitor_status_range (min <= max, ambos 100..599).
export const httpConfigSchema = z
    .object({
        url: dto.httpUrl,
        method: z.enum(["GET", "HEAD", "POST"]).default("GET"),
        request_headers: z.record(z.string(), z.string()).default({}),
        request_body: z.string().optional(),
        expected_status_min: dto.statusHttp.default(200),
        expected_status_max: dto.statusHttp.default(399),
        expected_body_contains: z.string().optional(),
        follow_redirects: z.boolean().default(true),
    })
    .refine((data) => data.expected_status_min <= data.expected_status_max, {
        message: "expected_status_min deve ser menor ou igual a expected_status_max.",
        path: ["expected_status_max"],
    });
export type HttpConfigInput = z.infer<typeof httpConfigSchema>;

// ping_packet_count, ping_packet_loss. `host` nao tem CHECK de formato no
// banco (aceita FQDN ou IP) -- so nao pode ser vazio.
export const pingConfigSchema = z.object({
    host: dto.nomeObrigatorio("O host", 255),
    packet_count: z.coerce.number().int().min(1).max(10).default(3),
    max_packet_loss_percent: dto.percentual.default(0),
});
export type PingConfigInput = z.infer<typeof pingConfigSchema>;

// Variantes parciais, usadas na atualizacao -- o monitor_type ja esta
// fixado (nao muda), entao so os campos especificos entram no update.
export const sslConfigUpdateSchema = sslConfigSchema.partial();
export const httpConfigUpdateSchema = z
    .object({
        url: dto.httpUrl,
        method: z.enum(["GET", "HEAD", "POST"]),
        request_headers: z.record(z.string(), z.string()),
        request_body: z.string(),
        expected_status_min: dto.statusHttp,
        expected_status_max: dto.statusHttp,
        expected_body_contains: z.string(),
        follow_redirects: z.boolean(),
    })
    .partial();
export const pingConfigUpdateSchema = pingConfigSchema.partial();
