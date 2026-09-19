import { z } from "zod";
import * as dto from "@/lib/dto/common";
import {
    httpConfigSchema,
    httpConfigUpdateSchema,
    pingConfigSchema,
    pingConfigUpdateSchema,
    sslConfigSchema,
    sslConfigUpdateSchema,
} from "@/lib/dto/monitor-config.dto";

// resource_type dos monitores no escopo do MVP (dos 8 tipos do schema --
// server_agent e os demais ficam para depois). 'continuous' so vale para
// server_agent (monitors_continuous_agent_only), entao fica fora daqui:
// todo monitor do MVP roda em execution_mode = 'interval'.
export const monitorType = z.enum(["ssl", "http", "ping"]);

// monitors_timeout_range: BETWEEN 1 AND 300
const timeoutSeconds = z.coerce.number().int().min(1).max(300);
// monitors_cooldown_nonnegative
const cooldownSeconds = z.coerce.number().int().min(0);
const monitorStatus = z.enum(["active", "paused", "archived"]);

const commonMonitorFields = {
    resource_id: dto.uuid,
    name: dto.nomeObrigatorio("O nome"),
    // monitors_interval_or_continuous: >= 10s no modo interval, unico modo
    // suportado no MVP.
    interval_seconds: dto.intervaloSegundos.default(60),
    timeout_seconds: timeoutSeconds.default(30),
    failure_threshold: dto.threshold.default(2),
    recovery_threshold: dto.threshold.default(1),
    notification_cooldown_seconds: cooldownSeconds.default(300),
};

// Uniao discriminada por monitor_type: cada variante exige o `config`
// especifico do tipo (issue #31), com os CHECKs de ssl_monitor_configs/
// http_monitor_configs/ping_monitor_configs espelhados em
// src/lib/dto/monitor-config.dto.ts. Tipo de config incompativel com o
// monitor_type e impossivel de expressar aqui -- o proprio TypeScript ja
// barra na borda, antes mesmo de qualquer validacao Zod rodar.
export const createMonitorSchema = z.discriminatedUnion("monitor_type", [
    z.object({ monitor_type: z.literal("ssl"), ...commonMonitorFields, config: sslConfigSchema }),
    z.object({ monitor_type: z.literal("http"), ...commonMonitorFields, config: httpConfigSchema }),
    z.object({ monitor_type: z.literal("ping"), ...commonMonitorFields, config: pingConfigSchema }),
]);

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

// resource_id, monitor_type e execution_mode nao sao editaveis nesta
// versao -- mudar o tipo de recurso monitorado ou o modo de execucao e,
// na pratica, criar outro monitor. current_state, consecutive_failures,
// consecutive_successes, next_check_at e last_check_at sao controlados pelo
// worker (M6), nunca pela API de escrita.
//
// `config` fica com o shape solto aqui de proposito: o monitor_type ja
// esta gravado no banco e so o controller (depois de buscar o monitor) sabe
// qual schema de config aplicar -- ver monitorConfigUpdateSchemas abaixo.
export const updateMonitorSchema = z
    .object({
        name: dto.nomeObrigatorio("O nome"),
        interval_seconds: dto.intervaloSegundos,
        timeout_seconds: timeoutSeconds,
        failure_threshold: dto.threshold,
        recovery_threshold: dto.threshold,
        notification_cooldown_seconds: cooldownSeconds,
        status: monitorStatus,
        config: z.record(z.string(), z.unknown()),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

export const monitorConfigUpdateSchemas = {
    ssl: sslConfigUpdateSchema,
    http: httpConfigUpdateSchema,
    ping: pingConfigUpdateSchema,
};

export const listMonitorsQuerySchema = dto.paginacao.extend({
    monitor_type: monitorType.optional(),
    status: monitorStatus.optional(),
    current_state: z.enum(["unknown", "up", "down", "degraded"]).optional(),
});

export type ListMonitorsQuery = z.infer<typeof listMonitorsQuerySchema>;
