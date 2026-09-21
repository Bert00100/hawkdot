# Worker, incidentes e notificações

[Índice](README.md) · [Operação](operacao.md)

## Processo de monitoramento

`npm run worker` executa [run.ts](../src/worker/run.ts) via tsx. Carrega `.env`, conecta como worker e trata SIGINT/SIGTERM. O loop reserva até três monitores e roda o lote em paralelo. Lote cheio leva a nova reserva sem pausa; caso contrário, espera 15s. Falha no polling é registrada e tentada novamente. O intervalo de um monitor é elegibilidade, não garantia de execução no segundo exato.

[scheduler.model.ts](../src/worker/scheduler.model.ts) chama `hawkdot_private.reserve_due_monitors`. A função enxerga todas as organizações, seleciona monitores ativos de intervalo com `next_check_at <= now()`, usa `FOR UPDATE SKIP LOCKED` e avança next_check_at atomicamente. Workers concorrentes não reservam a mesma linha enquanto ela está bloqueada. Isso não é garantia de execução exatamente uma vez: checks que excedam o intervalo e múltiplas instâncias merecem testes específicos. A persistência evita sobrescrita por resultados antigos.

## Uma execução

[execute-monitor.ts](../src/worker/execute-monitor.ts) segue esta ordem:

1. Lê config em uma transação curta com contexto da organização.
2. Executa I/O de rede **fora da transação**.
3. Abre outra transação, bloqueia o monitor e revalida seu estado.
4. Descarta resultado se monitor foi excluído/pausado ou se já existe check mais recente.
5. Grava execução, atualiza estado/contadores, incidentes, eventos e auditoria atomicamente.

Config ausente é registrada e pulada. server_agent não tem executor no MVP. [checks/run-check.ts](../src/worker/checks/run-check.ts) escolhe executor; [types.ts](../src/worker/checks/types.ts) define `CheckResult`.

| Check | Implementação | Diagnóstico comum |
|---|---|---|
| HTTP | http-check.ts | Status fora da faixa, corpo esperado ausente, redirect ou timeout |
| SSL | ssl-check.ts | Cadeia, hostname, SNI, porta, validade e dias restantes |
| Ping | ping-check.ts | Binário ausente, permissão ICMP, locale, host e perda de pacotes |

Timeout, failure e error contam como falha para o estado. Certificado próximo do vencimento pode ter check success e estado observado degraded: gera aviso SSL, sem necessariamente abrir incidente de disponibilidade.

## Transições e eventos

[incident-state-machine.ts](../src/worker/incident-state-machine.ts) conta falhas/sucessos consecutivos. Com failure_threshold=2, uma falha isolada não derruba o estado; ao atingir o limiar, abre incidente e emite monitor.down/incident.opened. Recuperação exige recovery_threshold e resolve o incidente ativo. O banco tem índice único parcial para impedir mais de um incidente ativo por monitor.

| Evento | Severidade usual | Origem |
|---|---|---|
| monitor.down | critical | Transição para down |
| incident.opened | critical | Abertura de incidente |
| monitor.up | info | Recuperação |
| incident.resolved | info | Resolução de incidente |
| ssl.expiring | warning ou critical | Faixa de vencimento SSL |

Reconhecer incidente via API é uma ação humana; não resolve a falha. Worker registra auditoria com actor_user_id nulo. Para SSL, [ssl-expiry-events.ts](../src/worker/ssl-expiry-events.ts) compara a faixa atual com o aviso anterior e evita repetição enquanto a urgência não aumenta.

## Motor de notificações: disponível como serviço, ainda sem acionamento automático

[delivery-engine.ts](../src/notifications/delivery-engine.ts) exporta `processPendingEvents(tx, organizationId)`; [dispatch-pending.ts](../src/notifications/dispatch-pending.ts) exporta `dispatchPendingDeliveries(tx, organizationId, limit=50)`. Hoje os chamadores encontrados no projeto são testes: não existe loop/rota de produção que acione esses serviços. Subir o worker de monitoramento **não envia notificações**.

Ambos precisam de contexto com papel da API e permissões para os dados envolvidos. O login do worker não tem os grants necessários para regras/canais/credenciais. Um futuro acionamento precisa definir identidade, transações, concorrência e agendamento; não basta importar essas funções em `worker/run.ts`.

O motor seleciona eventos sem entregas, casa regras por evento/monitor, filtra severidade, recuperação e canais habilitados e cria pending ou skipped. Skipped significa cooldown ativo, marcando aquele par como avaliado sem envio. Evento sem regra/canal elegível não ganha entrega e continua elegível à reavaliação. O retorno processed conta eventos examinados, não mensagens enviadas.

**Comportamento atual que diverge de comentários antigos:** o código aplica o maior cooldown entre regra e monitor sempre que o evento tem monitor, inclusive para regra geral. Mede o intervalo com `Date.now()` em relação ao último sent_at do par regra/canal. Não mede pelo happened_at. Preserve ou altere esse contrato explicitamente, com teste, em vez de usar o comentário como especificação.

## Despacho e retry

O dispatcher seleciona pending/failed, attempt_count < 20 e próxima tentativa vencida ou nula. Telegram usa sendMessage; webhook faz POST JSON `{"message":"..."}`, com Bearer opcional. A mensagem atual é genérica, sem template detalhado do evento. Timeout do adapter: 10s.

Falha incrementa tentativas e agenda `30s * 2^(attempt_count-1)`, limitado a 1h. Na tentativa 20, next_attempt_at vira null e o filtro de contagem impede novos envios. Sucesso grava sent_at. Exceções são isoladas por delivery. Adapters sanitizam o segredo dos erros; qualquer novo adapter deve fazer o mesmo, inclusive em catch.

Limitações para integrar o serviço: rede ainda acontece dentro da transação recebida; não há garantia documentada de despacho exatamente uma vez nem coordenação completa entre consumidores concorrentes. Os testes existentes não tornam esse serviço um daemon de produção pronto. Um novo fluxo automático deve testar duração de transação, concorrência e falha após envio antes da gravação.
