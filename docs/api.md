# Referência HTTP

[Índice](README.md) · [Backend](backend.md)

Base local: `http://localhost:3000`. Envie JSON com `Content-Type: application/json`. Autenticação é cookie `hawkdot_session`, emitido no login; não é Bearer token. Exceto health, signup e login, os endpoints abaixo exigem sessão. Logout pode limpar cookie mesmo sem sessão válida.

Os links apontam para a implementação; os DTOs são a referência exata de validação. Datas serializam como ISO, IDs são UUID. Sucesso devolve dados diretamente, sem `{data: ...}`. Consulte [erros](backend.md) para o envelope de falha.

## Catálogo completo

Leitura comum exige membro ativo; escrita operacional exige owner/admin/operator. Gestão exige owner/admin. Exceções de sessão/convite estão indicadas.

| Método | Caminho | Entrada / resultado principal | Acesso |
|---|---|---|---|
| GET | `/api/health` | Saúde da conexão; 503 em indisponibilidade | Público |
| POST | `/api/auth/signup` | Dados de cadastro → usuário e organização, 201 | Público |
| POST | `/api/auth/login` | Email/senha → usuário, organization_id e cookie | Público |
| POST | `/api/auth/logout` | Limpa cookie, 200 com `{ok: true}` | Limpeza local |
| POST | `/api/auth/switch-organization` | organization_id → organização e novo cookie | Membro ativo do destino |
| GET | `/api/me` | user, organization, organizations | Sessão |
| GET | `/api/organizations` | Organização ativa | Leitura |
| PATCH | `/api/organizations` | name, slug e/ou kind | Gestão |
| GET | `/api/organizations/members` | Lista paginada de membros | Leitura |
| POST | `/api/organizations/members` | email, role → convite, 201 | Gestão |
| PATCH | `/api/organizations/members/[userId]` | role → vínculo atualizado | Gestão, restrições de owner |
| DELETE | `/api/organizations/members/[userId]` | Remove vínculo, 200 | Gestão, restrições de owner |
| POST | `/api/invitations/accept` | organization_id → vínculo aceito | Próprio convidado |
| GET | `/api/resources` | Lista paginada e filtrada | Leitura |
| POST | `/api/resources/domains` | display_name, fqdn, environment? → recurso, 201 | Escrita |
| GET/PATCH/DELETE | `/api/resources/domains/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| POST | `/api/resources/endpoints` | display_name, url, environment? → recurso, 201 | Escrita |
| GET/PATCH/DELETE | `/api/resources/endpoints/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| POST | `/api/resources/ips` | display_name, address, environment? → recurso, 201 | Escrita |
| GET/PATCH/DELETE | `/api/resources/ips/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| GET | `/api/monitors` | Lista paginada e filtrada | Leitura |
| POST | `/api/monitors` | Recurso, nome, tipo, config → monitor, 201 | Escrita |
| GET/PATCH/DELETE | `/api/monitors/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| PATCH | `/api/incidents/[id]/acknowledge` | Sem payload; reconhece incidente open | Escrita |
| GET/POST | `/api/credentials` | Lista metadados / cria credencial, 201 | Gestão |
| DELETE | `/api/credentials/[id]` | Exclui credencial, 200 | Gestão |
| GET/POST | `/api/notification-channels` | Lista / cria canal, 201 | Leitura / escrita |
| GET/PATCH/DELETE | `/api/notification-channels/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| GET/POST | `/api/notification-rules` | Lista / cria regra, 201 | Leitura / escrita |
| GET/PATCH/DELETE | `/api/notification-rules/[id]` | Detalhe / edição / exclusão 200 | Leitura / escrita |
| GET | `/api/audit-logs` | Auditoria paginada | Gestão |

DELETE e logout respondem HTTP 200 com `{ "ok": true }`; não há corpo vazio nesses handlers atuais.

`[id]`/`[userId]` são placeholders: substitua pelo UUID, sem colchetes. As coleções de recursos por tipo têm apenas POST; liste todos os tipos pelo GET `/api/resources`. Não existe GET `/api/incidents` ou endpoint de histórico completo de execuções nesta versão. Fontes: [rotas](../src/app/api), [DTOs](../src/lib/dto), [controllers](../src/controllers).

## Cadastro, organização e membros

Signup exige `email`, `password`, `display_name`, `organization_name`, `organization_slug`. Senha: 8–128 caracteres, pelo menos uma letra e um número. Login recebe email e password. Signup não emite cookie; faça login depois.

Organização aceita PATCH parcial de `name`, `slug`, `kind` (`personal/company`), nunca status. Convite recebe email de conta existente e `role` (`owner/admin/operator/viewer`); não envia email automaticamente. Aceite recebe `organization_id`; depois troque a organização ativa explicitamente. Lista de membros inclui `user_id`, email, display_name, role, status e joined_at.

## Listas e filtros

Paginação de recursos, monitores, membros e auditoria: `page` inicia em 1; `per_page` padrão 20, entre 1 e 100. Resposta:

```json
{"items":[],"page":1,"per_page":20,"total":0}
```

Canais, regras e credenciais retornam arrays sem esse formato de paginação.

| Coleção | Filtros adicionais |
|---|---|
| resources | q, resource_type (`domain/ip/url_endpoint`), status (`active/paused/archived`), environment (`production/staging/development/other`) |
| monitors | q, monitor_type (`ssl/http/ping`), status (`active/paused/archived`), current_state (`unknown/up/down/degraded`) |

`q` busca nome antes de aplicar offset/limit. Não envie `q=` vazio; omita quando não houver busca. O frontend monta query strings em [resources.ts](../src/lib/api/resources.ts) e [monitors.ts](../src/lib/api/monitors.ts).

## Recursos e monitores

Recursos têm `display_name` e `environment` (padrão production), mais `fqdn`, `url` ou `address` conforme tipo. PATCH aceita os mesmos campos parcialmente, sem trocar o tipo. Um domínio é hostname sem esquema/caminho; endpoint é URL HTTP(S); IP aceita endereço IPv4/IPv6. A URL não é normalizada automaticamente.

Monitor exige `resource_id`, `name`, `monitor_type`, `config`. O destino do check está no config; cadastrar recurso não preenche nem executa sozinho o monitor.

| Campo comum | Padrão / restrição |
|---|---|
| interval_seconds | 60; mínimo 10 |
| timeout_seconds | 30; 1 a 300 |
| failure_threshold | 2; inteiro de 1 a 20 |
| recovery_threshold | 1; inteiro de 1 a 20 |
| notification_cooldown_seconds | 300; inteiro não negativo |

| Tipo | Config obrigatório | Opcionais e padrões |
|---|---|---|
| http | url | method GET (GET/HEAD/POST), request_headers {}, request_body, expected_status_min 200, expected_status_max 399, expected_body_contains, follow_redirects true |
| ssl | hostname | port 443, sni_name, verify_chain true, verify_hostname true, warning_days [30,14,7,3,1] |
| ping | host | packet_count 3 (1–10), max_packet_loss_percent 0 (0–100) |

HTTP exige mínimo de status ≤ máximo, ambos entre 100 e 599. SSL exige pelo menos um warning day positivo. PATCH do monitor aceita nome, intervalos/thresholds, cooldown, `status` e config parcial. Não aceita trocar recurso/tipo/modo nem editar estado/contadores controlados pelo worker.

GET de monitor inclui config; listagem traz resumo. Ambos incluem `last_check_at`, `next_check_at` e `last_execution` nullable. A última execução expõe `check_status`, `started_at`, `finished_at`, `response_time_ms` e `summary`. Trate falta de execução explicitamente.

## Credenciais, canais e regras

Credencial: `name`, `credential_type` (`username_password/api_token/ssh_key/client_certificate`), `secret` obrigatório e `username` opcional. Resposta contém id, name, credential_type, username e created_at; nunca o segredo cifrado ou em texto puro.

Canal Telegram: `channel_type: "telegram"`, name, chat_id, credential_id opcional no DTO, message_thread_id opcional positivo. Para enviar, o adapter exige uma credencial de bot associada. Webhook: `channel_type: "webhook"`, name, url e credential_id opcional; se houver segredo, envia como Bearer. PATCH de canal aceita apenas name/enabled. Resposta tem id, channel_type, name, enabled e config seguro.

Regra: name e `event_codes` não vazio; opcionais `monitor_id`, `minimum_severity` (info/warning/critical, padrão warning), `cooldown_seconds` (300), `notify_recovery` (true), `channel_ids` ([]). PATCH aceita name, enabled, event_codes, minimum_severity, cooldown_seconds, notify_recovery e channel_ids, não monitor_id. Um array channel_ids novo substitui as associações; array vazio remove todas.

Eventos aceitos: `monitor.down`, `monitor.up`, `incident.opened`, `incident.resolved`, `ssl.expiring`. Para receber recuperação de severidade info, configure também minimum_severity=info; notify_recovery=true sozinho não ultrapassa o filtro de severidade. Criar regra/canal não ativa envio automático: leia [worker e notificações](worker-notificacoes.md).

## Exercício com curl

Use dados de desenvolvimento e mantenha `cookies.txt` fora do repositório. O exemplo abaixo usa `/tmp/hawkdot-cookies.txt`, que contém sessão sensível.

```bash
curl -i -H 'Content-Type: application/json'   -d '{"email":"dev@example.com","password":"SenhaLocal123","display_name":"Dev Local","organization_name":"Equipe Local","organization_slug":"equipe-local"}'   http://localhost:3000/api/auth/signup

curl -i -c /tmp/hawkdot-cookies.txt -H 'Content-Type: application/json'   -d '{"email":"dev@example.com","password":"SenhaLocal123"}'   http://localhost:3000/api/auth/login

curl -b /tmp/hawkdot-cookies.txt http://localhost:3000/api/me

curl -b /tmp/hawkdot-cookies.txt -H 'Content-Type: application/json'   -d '{"display_name":"Site de exemplo","url":"https://example.com"}'   http://localhost:3000/api/resources/endpoints
```

Copie o `id` do recurso e substitua `UUID_DO_RECURSO`:

```bash
curl -b /tmp/hawkdot-cookies.txt -H 'Content-Type: application/json'   -d '{"resource_id":"UUID_DO_RECURSO","name":"HTTP exemplo","monitor_type":"http","config":{"url":"https://example.com"}}'   http://localhost:3000/api/monitors

curl -b /tmp/hawkdot-cookies.txt   'http://localhost:3000/api/monitors?page=1&per_page=20&q=exemplo'
```

Com worker ativo, consulte novamente depois do check. Para pausar, substitua `UUID_DO_MONITOR`:

```bash
curl -X PATCH -b /tmp/hawkdot-cookies.txt -H 'Content-Type: application/json'   -d '{"status":"paused"}' http://localhost:3000/api/monitors/UUID_DO_MONITOR

curl -X POST -b /tmp/hawkdot-cookies.txt -c /tmp/hawkdot-cookies.txt   http://localhost:3000/api/auth/logout
```

Use um nome/email novos ao repetir signup: duplicatas retornam conflito. Nenhum exemplo de exclusão é necessário para validar a instalação.
