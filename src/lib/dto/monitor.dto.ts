import { z } from "zod";
import * as dto from "@/lib/dto/common";

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

export const createMonitorSchema = z.object({
    resource_id: dto.uuid,
    monitor_type: monitorType,
    name: dto.nomeObrigatorio("O nome"),
    // monitors_interval_or_continuous: >= 10s no modo interval, unico modo
    // suportado no MVP.
    interval_seconds: dto.intervaloSegundos.default(60),
    timeout_seconds: timeoutSeconds.default(30),
    failure_threshold: dto.threshold.default(2),
    recovery_threshold: dto.threshold.default(1),
    notification_cooldown_seconds: cooldownSeconds.default(300),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

// resource_id, monitor_type e execution_mode nao sao editaveis nesta
// versao -- mudar o tipo de recurso monitorado ou o modo de execucao e,
// na pratica, criar outro monitor. current_state, consecutive_failures,
// consecutive_successes, next_check_at e last_check_at sao controlados pelo
// worker (M6), nunca pela API de escrita.
export const updateMonitorSchema = z
    .object({
        name: dto.nomeObrigatorio("O nome"),
        interval_seconds: dto.intervaloSegundos,
        timeout_seconds: timeoutSeconds,
        failure_threshold: dto.threshold,
        recovery_threshold: dto.threshold,
        notification_cooldown_seconds: cooldownSeconds,
        status: monitorStatus,
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Informe ao menos um campo para atualizar.",
    });

export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

export const listMonitorsQuerySchema = dto.paginacao.extend({
    monitor_type: monitorType.optional(),
    status: monitorStatus.optional(),
    current_state: z.enum(["unknown", "up", "down", "degraded"]).optional(),
});

export type ListMonitorsQuery = z.infer<typeof listMonitorsQuerySchema>;
