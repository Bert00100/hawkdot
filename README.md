# hawkdot

SaaS de monitoramento de infraestrutura (estilo UptimeRobot) — SSL, HTTP, ping —
multi-tenant, com isolamento por Row-Level Security no PostgreSQL. Backend em
Next.js 16 (App Router / Route Handlers) + Prisma 7, mais um worker Node
standalone que executa os checks agendados.

> **Atenção**: este projeto roda numa versão do Next.js diferente da que você
> conhece (breaking changes de API/convenções). Antes de mexer em qualquer
> coisa relacionada ao framework, leia `node_modules/next/dist/docs/` e o
> aviso no topo de `AGENTS.md`.

## Documentação para desenvolvimento

Comece pelo [índice de documentação](docs/README.md): setup completo, mapas de
backend/frontend, referência HTTP, banco/RLS, worker, testes e diagnóstico.
O [guia de ambiente local](docs/ambiente-local.md) apresenta a sequência completa
para quem acabou de clonar o projeto.

## Stack

- **Next.js 16** (Route Handlers em `src/app/api/`; proteção das rotas com `withSession`)
- **Prisma 7** com `@prisma/adapter-pg` (driver adapter, não a URL de conexão padrão)
- **PostgreSQL 17** com RLS como mecanismo real de isolamento multi-tenant (o banco é a fonte de verdade, não a aplicação)
- **Zod** para validação de entrada (DTOs espelhando os `CHECK` constraints do schema)
- **argon2id** para hash de senha, **jose** para JWT de sessão (cookie httpOnly)
- **Jest** rodando contra um Postgres real (sem mock de Prisma)

A convenção de camadas (`route.ts` → `controller` → `model` → Prisma), o
contrato de acesso a dados multi-tenant e as decisões de arquitetura mais
importantes estão documentadas em **[`AGENTS.md`](./AGENTS.md)** — leia antes
de adicionar uma feature nova.

## Setup local

### 1. Banco de dados

```bash
docker compose -f docker/docker-compose.yml up -d
```

Sobe um Postgres 17 (`hawkdot-PSQL`) com um superusuário administrativo
(`adm`). Esse superusuário nunca é usado pela aplicação — só para aplicar o
schema e rodar os scripts de setup.

Aplique o schema **uma única vez em banco vazio** (cria os schemas
`hawkdot`/`hawkdot_private`, tipos, tabelas, RLS policies e os roles
`hawkdot_app`/`hawkdot_worker`). Ele não é idempotente: para atualizar banco
existente, use SQL incremental conforme o [guia de banco](docs/banco.md):

```bash
docker exec -i hawkdot-PSQL psql -v ON_ERROR_STOP=1 -U adm -d hawkdot < db/hawkdot_postgresql17_schema.sql
```

Em seguida, crie os *login roles* que a aplicação de fato usa para conectar
(não vêm no schema — são credenciais, não estrutura) e conceda a eles o role
correspondente:

```sql
CREATE ROLE hawkdot_api_login LOGIN PASSWORD '<senha>';
GRANT hawkdot_app TO hawkdot_api_login;

CREATE ROLE hawkdot_worker_login LOGIN PASSWORD '<senha>';
GRANT hawkdot_worker TO hawkdot_worker_login;
```

`hawkdot_app` é o role da API (`Route Handlers`), `hawkdot_worker` é o role
do processo de monitoramento — grants deliberadamente diferentes entre os
dois (ver "Worker" em `AGENTS.md`).

### 2. Variáveis de ambiente

Crie um `.env` na raiz (nunca commitado) com:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Connection string do role `hawkdot_api_login`, banco `hawkdot` |
| `JWT_SECRET` | sim | Segredo de assinatura do JWT de sessão (mín. 32 caracteres) |
| `JWT_TTL_SECONDS` | não (default `3600`) | TTL do JWT — não há revogação imediata, ver `AGENTS.md` |
| `CREDENTIAL_ENCRYPTION_KEY` | sim | 64 caracteres hex (32 bytes) — chave AES-256-GCM para cifrar segredos de `credentials` |
| `DATABASE_URL_WORKER` | só para rodar o worker | Connection string do role `hawkdot_worker_login` |
| `DATABASE_URL_TEST` / `DATABASE_URL_TEST_ADMIN` | só para testes | Connection strings de `hawkdot_test` (app e `adm`) |
| `DATABASE_URL_WORKER_TEST` | só para testes do worker | Connection string de teste do role `hawkdot_worker_login` |

Gere a chave de criptografia com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Banco de testes

```bash
npm run db:test:setup
```

Recria `hawkdot_test` do zero a partir do mesmo `db/hawkdot_postgresql17_schema.sql`
(destrutivo — apaga todos os dados de teste a cada execução).

### 4. Instalar dependências e subir a API

```bash
npm ci
npx prisma generate --config prisma7.config.ts
npm run dev
```

Interface em [http://localhost:3000](http://localhost:3000); saúde da API em
[http://localhost:3000/api/health](http://localhost:3000/api/health).
Não existe um handler no caminho `/api` isoladamente.

### 5. Iniciar o monitoramento

Em outro terminal, mantenha o worker em execução:

```bash
npm run worker
```

O servidor web sozinho **não executa checagens**. O worker deve registrar
`conectado como hawkdot_worker_login` e reservar os monitores pendentes.
`GET /api/health` verifica a API e o banco; não confirma que o worker está ativo.
A interface atualiza monitores a cada 15 segundos e mostra a última execução
real. Monitores novos permanecem aguardando até a primeira checagem.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API em modo desenvolvimento |
| `npm run build` / `npm run start` | Build e start de produção |
| `npm run worker` | Roda o processo de monitoramento (`src/worker/run.ts`) — separado da API, conexão própria |
| `npm test` | Suíte completa (Jest, contra Postgres real, `maxWorkers: 1`) |
| `npm run test:watch` | Jest em modo watch |
| `npm run test:coverage` | Suíte com relatório de cobertura |
| `npm run db:test:setup` | Recria `hawkdot_test` a partir do schema |
| `npm run lint` | ESLint |

## Arquitetura em uma frase por camada

```
route.ts  ──▶  controller  ──▶  model  ──▶  Prisma Client
 (HTTP)        (orquestra)      (dados)     (config/database.ts)
```

- `src/app/api/<recurso>/route.ts` — só traduz HTTP, sem regra de negócio.
- `src/controllers/<recurso>.controller.ts` — regra de negócio, autorização por papel, nunca conhece `Request`/`NextResponse`.
- `src/models/<recurso>.model.ts` — único lugar que fala Prisma; toda query roda dentro do wrapper `withTenant`/`withWorkerTenant`, que define o contexto de RLS.
- `src/worker/` — processo standalone separado da API, conexão própria (`hawkdot_worker_login`), faz o polling dos monitores devidos e roda os checks.
- `src/notifications/` — motor de entrega de notificações (casa evento → regra → canal, cooldown, retry com backoff), roda com o role da API.

Detalhes de cada decisão (por que RLS, por que dois roles de banco, os
achados sobre `INSERT ... RETURNING` com RLS assimétrico, o vocabulário de
eventos, etc.) estão em `AGENTS.md`.

## API (visão geral)

| Recurso | Rotas |
|---|---|
| Autenticação | `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/switch-organization` |
| Sessão | `GET /api/me` |
| Organização | `GET /api/organizations`, `PATCH /api/organizations` |
| Membros | `GET/POST /api/organizations/members`, `PATCH/DELETE /api/organizations/members/[userId]`, `POST /api/invitations/accept` |
| Recursos | `GET /api/resources`, CRUD em `/api/resources/domains`, `/api/resources/endpoints`, `/api/resources/ips` |
| Monitores | `GET/POST /api/monitors`, `GET/PATCH/DELETE /api/monitors/[id]` |
| Incidentes | `PATCH /api/incidents/[id]/acknowledge` |
| Credenciais | `GET/POST /api/credentials`, `DELETE /api/credentials/[id]` |
| Canais de notificação | `GET/POST /api/notification-channels`, `GET/PATCH/DELETE /api/notification-channels/[id]` |
| Regras de notificação | `GET/POST /api/notification-rules`, `GET/PATCH/DELETE /api/notification-rules/[id]` |
| Auditoria | `GET /api/audit-logs` (restrito a `owner`/`admin`) |
| Saúde | `GET /api/health` |

Toda resposta de sucesso devolve os dados direto, sem envelope; erro sempre
segue `{ error: { code, message, details? } }` (ver `AGENTS.md` para os
códigos e status HTTP correspondentes).

## Testes

```bash
npm test
```

A suíte roda contra um Postgres real (`hawkdot_test`), não mocka o Prisma —
policies de RLS e `CHECK` constraints são parte do que está sendo testado.
Exige `npm run db:test:setup` rodado antes (e o container do docker-compose
no ar).

### Navegador (desktop e celular)

```bash
npx playwright install chromium
npm run test:e2e
```

Execute depois de `npm test`, nunca simultaneamente: ambos usam `hawkdot_test`.
O Playwright inicia uma API separada na porta 3100, seu próprio worker e um
endpoint HTTPS local na 3443. Usa `.next-e2e` para preservar o servidor de
desenvolvimento e aceita o certificado de fixture apenas nesses subprocessos.
As URLs de teste devem apontar para `hawkdot_test`; os testes criam contas
exclusivas de QA e removem somente essas contas e organizações ao terminar.
Screenshots ficam em `test-results`; falhas incluem um trace do navegador.

Para verificar produção sem disputar o diretório do servidor ativo:

```bash
NEXT_DIST_DIR=.next-build npm run build
```

As listagens de recursos e monitores aceitam `q` para busca por nome antes
da paginação. Respostas de monitores incluem `last_check_at`, `next_check_at`
e `last_execution` (nullable), com status, horários, latência e resumo seguro.
Não há cálculo de uptime histórico nesta versão.
