# Banco, transações e isolamento

[Índice](README.md) · [Ambiente local](ambiente-local.md)

## Fontes de verdade

[hawkdot_postgresql17_schema.sql](../db/hawkdot_postgresql17_schema.sql) define tabelas, enums, constraints, índices, funções, grants e policies. [schema.prisma](../prisma/schema.prisma) representa o banco para o client, mas não substitui SQL de RLS/CHECK/índices especiais. Não há histórico de migrations Prisma versionado atualmente, apesar da configuração prever a pasta.

Não use `db push` ou `migrate dev` como atalho para reconstruir este banco: o schema Prisma não descreve todas as garantias SQL. `db pull` também não é inofensivo: o arquivo contém ajustes manuais de relações 1:1 e da relação monitors–incidents. Leia o cabeçalho antes de qualquer introspecção.

## Mapa das 30 tabelas

| Grupo | Tabelas |
|---|---|
| Identidade | users, organizations, organization_members |
| Segredos | credentials |
| Recursos | resources, domain_resources, ip_resources, server_resources, database_resources, endpoint_resources |
| Monitoramento | monitors, server_agents, monitor_executions, incidents, events |
| Configurações | ssl_monitor_configs, dns_monitor_configs, domain_expiration_monitor_configs, http_monitor_configs, ping_monitor_configs, tcp_monitor_configs, database_monitor_configs, server_agent_monitor_configs |
| Notificações | notification_channels, telegram_channel_configs, browser_push_subscriptions, notification_rules, notification_rule_channels, notification_deliveries |
| Auditoria | audit_logs |

Todas ficam no schema `hawkdot`; helpers sensíveis ficam em `hawkdot_private`. O banco contém estruturas além do MVP. Alterar um enum não implementa endpoint, formulário ou executor.

Recursos/monitores usam pai + filha por tipo, unidos por FK composta que inclui ID, organização e tipo. Gere UUID antes, grave pai e filha com tipo igual na mesma transação. Deletar pai remove filhas onde há CASCADE; outras referências podem restringir a operação. Confira a FK antes de prometer exclusão em cascata para todo o grafo.

## Quem conecta

| Login / papel | Uso |
|---|---|
| adm | Administração e população de testes; não usar na API/worker |
| hawkdot_api_login → hawkdot_app | API e serviços que precisam de dados do usuário |
| hawkdot_worker_login → hawkdot_worker | Monitoramento; grants menores, sem acesso irrestrito a regras/credenciais |

[database.ts](../src/config/database.ts) mantém o singleton da API. O worker tem conexão própria em `src/worker/database.ts`. Clients de testes são separados por finalidade. O default export guardado não é uma permissão para consultas de negócio diretas: operações de modelo fora de contexto lançam `MissingTenantContextError` em desenvolvimento/teste e registram aviso em produção.

## Como o tenant funciona

`withTenant({userId, organizationId}, callback)` abre uma transação e executa `set_config` para as duas variáveis. O terceiro argumento **true** limita os valores à transação; false permitiria vazamento ao reutilizar conexão do pool. Models recebem o `tx` do callback. Não guarde `tx` em estado global nem o use depois do callback.

`withWorkerTenant(organizationId, callback)` define apenas organização. Sem contexto, a RLS costuma devolver zero linhas, não necessariamente erro. Um filtro `where.organization_id` não substitui RLS; `requireRole` também não.

Exceções são específicas: health sem tabela de negócio; lookups/bootstrap de identidade e membros; aceite do próprio convite; reserva global de monitores. Funções SECURITY DEFINER executam com privilégios do dono e precisam limitar rigorosamente entrada, contexto e retorno. Não crie uma função genérica para ignorar RLS.

UPDATE/DELETE também dependem de visibilidade por SELECT. INSERT com RETURNING igualmente pode falhar se o papel pode inserir mas não ler. Isso explica funções dedicadas de convite e inserts sem RETURNING em auditoria/bootstrap. Teste com role restrito, não com adm.

## Como mudar estrutura

1. Escreva um teste que reproduza o comportamento com banco real e role restrito.
2. Atualize o SQL base para instalações novas, incluindo CHECK, índices, grants e policies necessários.
3. Para banco existente, prepare SQL incremental específico em arquivo versionado, com estratégia de aplicação e preservação dos dados. O repositório ainda não fornece um runner de migração padronizado; documente o comando exato na mudança.
4. Valide o SQL base em banco de testes recriado e o incremental numa cópia descartável do estado anterior. Recriar apenas o banco não prova que a atualização preserva dados.
5. Atualize a representação Prisma sem perder os ajustes manuais e rode `npx prisma generate --config prisma7.config.ts`.
6. Atualize DTOs, mensagens amigáveis de constraints e testes de alinhamento Zod/Postgres.
7. Verifique isolamento A/B e permissões por papel; registre impacto e rollback antes de aplicar fora do ambiente descartável.

O SQL base não é reaplicável integralmente. `db:test:setup` funciona repetidamente porque apaga e recria o banco inteiro.

## Consulta manual para diagnóstico

Conectado com o login restrito e UUIDs reais de um membro ativo, execute dentro de uma transação:

```sql
BEGIN;
SELECT set_config('hawkdot.current_user_id', 'UUID_USUARIO', true);
SELECT set_config('hawkdot.current_organization_id', 'UUID_ORGANIZACAO', true);
SELECT id, name, status, current_state, next_check_at
FROM hawkdot.monitors;
ROLLBACK;
```

Substitua os marcadores antes de executar. `ROLLBACK` encerra o contexto sem alterar dados. Uma consulta como adm não verifica a mesma autorização.

As listagens usam offset/limit e índices por organização. Execuções têm BRIN cronológico; não há expurgo automático. A retenção atual conserva tudo; TTL, particionamento e agregações são possibilidades futuras, não tarefas já configuradas.
