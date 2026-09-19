<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Convenção de camadas do backend

O backend do hawkdot segue MVC com uma **regra de dependência estrita**: cada camada só conhece a de baixo. Nunca pule uma camada e nunca aponte para cima.

```
route.ts  ──▶  controller  ──▶  model  ──▶  Prisma Client
 (HTTP)        (orquestra)      (dados)     (config/database.ts)
```

## As camadas

### `src/app/api/<recurso>/route.ts` — camada HTTP

Traduz HTTP para chamada de função e de volta. É a **única** camada que conhece `Request`/`NextResponse`, status codes, cookies e headers.

- Lê `request` (body, query, params), chama o controller, devolve `NextResponse`.
- Valida a entrada com o DTO do recurso antes de chamar o controller.
- Não contém regra de negócio, não faz `try/catch` de erro de banco e não importa Prisma.

### `src/controllers/<recurso>.controller.ts` — orquestração

Onde mora a regra de negócio. Recebe dados já validados e tipados, decide o que fazer e devolve dados puros (ou lança um erro de aplicação).

- Coordena vários models, aplica autorização por papel, monta o resultado.
- **Não** conhece `Request`, `NextResponse` nem status HTTP — devolver `NextResponse` daqui é erro de camada.
- **Não** fala Prisma nem SQL diretamente.

### `src/models/<recurso>.model.ts` — acesso a dados

Única camada que importa o Prisma Client. Uma função por operação de dados.

- Recebe e devolve tipos simples; nada de lógica de negócio condicional aqui.
- Toda leitura ou escrita de dados de tenant roda dentro do wrapper de contexto de tenant (ver `src/lib/tenant/`), porque as policies de RLS dependem do `set_config` que ele aplica. Uma query fora do wrapper volta vazia, não dá erro.

### `src/config/database.ts` — conexão

Instância única (singleton) do Prisma Client com o adapter `PrismaPg`. Ninguém mais instancia `PrismaClient` — exceto `src/test-utils/`, que mantém dois clients propositalmente (`admin-client` com privilégio para popular dados, `app-client` com o papel restrito que o código sob teste usa).

## Onde fica cada helper compartilhado

| Assunto | Local | Observação |
|---|---|---|
| Ambiente validado | `src/config/env.ts` | Único arquivo que lê `process.env` |
| Conexão Prisma | `src/config/database.ts` | Singleton com `PrismaPg` |
| Erros de aplicação | `src/lib/errors/` | `AppError` + mapeamento para HTTP |
| DTOs / validação Zod | `src/lib/dto/<recurso>.dto.ts` | Schemas de entrada por recurso |
| Contexto de tenant / RLS | `src/lib/tenant/` | Wrapper `withTenant` |
| Autorização por papel | `src/lib/auth/` | Guard de rota e checagem de papel |
| Helpers de teste | `src/test-utils/` | Factories, limpeza, clients |
| Código gerado do Prisma | `src/generated/prisma/` | Não editar à mão |

`src/lib/` é para código transversal, usado por mais de um recurso. Código que serve a um recurso só mora na camada dele.

## Convenções de nome

- **Arquivos**: `<recurso>.<camada>.ts` em `kebab-case`, recurso no singular — `health.model.ts`, `notification-channel.controller.ts`. Testes ficam ao lado do arquivo testado: `health.model.test.ts`.
- **Rotas**: a pasta em `src/app/api/` usa o recurso no **plural** (`/api/monitors`), seguindo a convenção REST; o arquivo de camada usa o singular.
- **Funções de model**: verbo + o que retorna, sem prefixo de camada — `findMonitorById`, `createMonitor`, `listMonitorsByOrganization`.
- **Funções de controller**: nomeadas pelo caso de uso, não pelo verbo HTTP — `registerUser`, `acceptInvitation`, `checkDatabaseConnection`.
- **Handlers de rota**: exports nomeados pelo método HTTP (`GET`, `POST`, `PATCH`, `DELETE`), como exige o Next.
- **Imports internos**: sempre pelo alias `@/` (configurado no `tsconfig.json` e no Jest), nunca caminho relativo que sobe diretório (`../../`).

## TDD

A suíte roda contra um Postgres real, em banco separado (`npm run db:test:setup`). Mockar o Prisma esconderia justamente os bugs que mais importam aqui — policy de RLS bloqueando uma query, CHECK constraint recusando um insert. Escreva o teste antes da implementação: `npm run test:watch`.


# Padrão de erro e resposta HTTP

Toda rota responde no mesmo formato. **Sucesso**: os dados direto, sem envelope. **Erro**: sempre

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados invalidos.", "details": [{ "field": "slug", "message": "..." }] } }
```

`details` só aparece quando há problema por campo. Os códigos e seus status estão em `src/lib/errors/app-error.ts`: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `INTERNAL_ERROR` 500, `SERVICE_UNAVAILABLE` 503.

**Como usar**: o controller lança uma das fábricas (`validationError`, `forbidden`, `notFound`, `conflict`, ...); a rota envolve o handler em `handleRoute`, que converte qualquer coisa lançada na resposta padrão.

```ts
// src/app/api/organizations/route.ts
export const POST = handleRoute(async (request: Request) => {
    const dados = await parseBody(criarOrganizacaoSchema, request);
    return okResponse(await criarOrganizacao(dados), 201);
});
```

**Erros do Prisma** são traduzidos automaticamente em `src/lib/errors/prisma.ts`: violação de unique vira 409, CHECK constraint vira 400 com a mensagem da regra, FK vira 400, registro ausente vira 404. Erro que não reconhecemos vira **500 genérico**, com o detalhe apenas no `console.error`.

> Nome de constraint, SQL, trecho de código e a linha que falhou **nunca** saem na resposta — a mensagem do Prisma com driver adapter carrega os dados do próprio usuário dentro. Para mapear um constraint novo, adicione a mensagem amigável nos dicionários `UNIQUE_MESSAGES` / `CHECK_MESSAGES` de `src/lib/errors/prisma.ts`.

# DTOs e validação de entrada

A validação roda na **borda** (rota), antes do controller. Os CHECK constraints do banco continuam valendo como última linha de defesa, não como a primeira: sem validação na aplicação, uma entrada inválida só seria recusada no Postgres e voltaria como erro cru.

**Como criar um DTO novo:**

1. Crie `src/lib/dto/<recurso>.dto.ts` e monte o schema Zod reaproveitando as primitivas de `src/lib/dto/common.ts` (`slug`, `email`, `fqdn`, `httpUrl`, `porta`, `threshold`, `statusHttp`, `intervaloSegundos`, `paginacao`, ...). Cada primitiva espelha um CHECK do schema SQL e cita qual no comentário.
2. Se o campo não tiver primitiva, crie uma em `common.ts` **citando o constraint correspondente** — não escreva a regra solta dentro do DTO.
3. Exporte também o tipo: `export type CriarMonitorInput = z.infer<typeof criarMonitorSchema>`. O controller recebe esse tipo, já validado.
4. Na rota, use `parseBody(schema, request)` para corpo JSON ou `parseQuery(schema, request)` para query string. Ambos lançam `VALIDATION_ERROR` (400) com a lista de campos — inclusive quando o JSON chega malformado.

Regra que vale a pena manter: sempre que uma primitiva nova espelhar um CHECK, escreva um teste que confronte o Zod com o banco de verdade (veja o bloco "alinhamento com os CHECK constraints do banco" em `src/lib/dto/common.test.ts`). Se o Zod aceitar algo que o Postgres recusa, o usuário toma um 500 em vez de um 400.

# Contrato de acesso a dados (multi-tenant / RLS)

O banco é a fonte de verdade do isolamento entre organizações e da autorização por papel — não o código da aplicação. Regras que não podem ser quebradas por nenhuma feature futura:

**Nenhuma query de negócio roda fora do `withTenant`.** `src/lib/tenant/with-tenant.ts` abre uma transação, define `hawkdot.current_user_id`/`hawkdot.current_organization_id` via `set_config` e só então entrega o client `tx` ao callback. Todo model de recurso recebe esse `tx` como parâmetro — nunca importa `prisma` (o default export de `src/config/database.ts`) para chamar um método de modelo. Esse default export é um client **guardado** (`src/lib/tenant/guard.ts`, issue #10): qualquer `findMany`/`create`/... nele direto lança `MissingTenantContextError` em desenvolvimento e teste, e só loga em produção.

**Por que `set_config` usa o terceiro parâmetro `true`.** Ele limita o valor à transação atual. Isso não é um detalhe — é o que torna seguro reusar conexões de um pool. Se fosse `false`, o valor setado numa request vazaria para a *próxima* request que pegasse a mesma conexão física do pool: um tenant leria dados de outro. Por isso `set_config` só pode rodar dentro de uma transação Prisma (`$transaction` interativo), nunca numa conexão solta.

**Exceções legítimas** — as únicas operações que rodam fora do `withTenant`, e por quê é seguro:
- `health.model.ts` — só faz `SELECT NOW()`, não toca tabela de negócio.
- Lookup de login por e-mail (M3, issue #12) — nesse momento ainda não existe `current_user_id` para definir; usa uma função `SECURITY DEFINER` em `hawkdot_private` que devolve só o necessário para autenticar.

Ambas usam `$queryRaw`/`$executeRaw` no client guardado — a extensão do #10 só intercepta operações de modelo (`$allModels`), não raw queries, então essas duas exceções não precisam de nenhuma lista de exclusão explícita no guard.

**A aplicação complementa o RLS, não o substitui.** Um helper como `requireRole` (M4) melhora a mensagem de erro (403 com texto claro em vez de um 404/lista vazia confuso) e evita uma query desnecessária, mas **nunca** é a única barreira — a policy de RLS correspondente sempre existe no banco. Se um helper de autorização tiver um bug, o RLS ainda impede o vazamento de dados.

**`adm` (o superusuário) nunca é usado pela aplicação.** Ele tem `BYPASSRLS` — existe só para administração do banco e para os testes populares dados via `src/test-utils/admin-client.ts` (que roda como `adm` de propósito, para poder inserir dados de teste ignorando as policies). Qualquer código de produção que precisar de um client Postgres usa o role `hawkdot_app` (API) ou `hawkdot_worker` (worker), nunca `adm`.

# Sessão e revogação (dívida técnica conhecida)

O hawkdot usa JWT em cookie httpOnly sem tabela de `sessions` no banco (decisão da M3, já registrada em memória de projeto). Isso tem uma consequência que vale deixar explícita:

**Não há revogação imediata.** Logout (`POST /api/auth/logout`) só limpa o cookie do lado do cliente — o token em si continua criptograficamente válido até expirar. Um token roubado (XSS que escapasse do `httpOnly`, log vazado, etc.) segue utilizável até o fim do TTL, mesmo depois de "logout" ou de trocar a senha.

**Mitigação atual**: TTL curto (`JWT_TTL_SECONDS`, 1h por padrão) limita a janela de exposição. Não há refresh token nem reemissão automática por atividade no MVP — quando o token expira, o usuário loga de novo.

**Se isso virar um problema real** (ex.: precisar de "logout em todos os dispositivos", ou revogar um token comprometido), as opções são: (a) voltar a ter uma tabela de sessions com um `jti` por token, checável a cada request — reintroduz uma query por request; ou (b) uma denylist de tokens revogados com TTL igual ao do JWT (Redis, por exemplo) — mais barata que sessions completas, mas é infraestrutura nova. Nenhuma das duas está implementada; fica registrado aqui para não ser redescoberto do zero.

# Postgres exige visibilidade de SELECT também em UPDATE/DELETE (achado da #24)

Ao resolver o terceiro conflito de RLS da M4 (convidado aceitando o próprio convite), uma policy de `UPDATE` dedicada — `USING (user_id = current_user_id() AND status = 'invited') WITH CHECK (status = 'active')`, pensada para ser combinada via `OR` com `members_update` — **não funcionou**, mesmo com todas as condições batendo individualmente.

Confirmado com `EXPLAIN (VERBOSE, COSTS OFF)` contra o banco real: o Postgres inclui `hawkdot_private.is_organization_member(organization_id)` no filtro da query **mesmo tendo uma policy de UPDATE dedicada que não menciona essa condição**. O motivo: para `UPDATE`/`DELETE`, o Postgres exige que a linha também seja visível por alguma policy de `SELECT` — essa exigência é **ANDada** por cima do `OR` das policies do próprio comando, não é algo opcional nem substituível por uma policy de UPDATE mais permissiva. Como `members_select` exige `is_organization_member()` (que só fica verdadeiro depois que o convite já foi aceito), a transição `invited → active` nunca conseguiria satisfazer essa exigência via policy nenhuma — é circular por construção, independente de como a policy de UPDATE for escrita.

**Solução**: `hawkdot_private.accept_own_invite(organization_id)`, `SECURITY DEFINER` com `row_security = off` — mesmo padrão das outras funções desta seção. Ignora RLS por completo para essa operação específica; usa `current_user_id()` internamente (não um parâmetro), então só pode aceitar o próprio convite de quem chama.

**Regra geral daqui pra frente**: se uma feature precisar de um `UPDATE`/`DELETE` que só deveria valer *antes* do usuário satisfazer a condição de `SELECT` da tabela (o mesmo padrão do bootstrap de tenant), não adianta tentar resolver com uma policy de `UPDATE`/`DELETE` adicional — vai esbarrar nessa mesma exigência implícita de `SELECT`. A saída é sempre uma função `SECURITY DEFINER` dedicada, como as demais desta lista.

# Rotas dinâmicas exigem `next typegen`

O helper `RouteContext<'/caminho/[param]'>` (usado para tipar o segundo argumento de rotas dinâmicas) só existe para as rotas que o Next já viu — o tipo é gerado, não vem do TypeScript puro. Depois de criar uma pasta com `[param]`, rode `npx next typegen` antes de `tsc --noEmit` (ou rode `npm run dev`/`next build` uma vez), senão o compilador acusa `Type '"/caminho/[param]"' does not satisfy the constraint '"/api/health"'` — o tipo antigo, gerado antes da rota nova existir.

# Padrão pai+filho para recursos e monitores (#26)

13 tabelas do schema seguem "tabela pai + tabela filha por tipo": `resources` (comum) + `domain_resources`/`ip_resources`/`server_resources`/`database_resources`/`endpoint_resources`; `monitors` (comum) + `ssl_monitor_configs`/`http_monitor_configs`/`ping_monitor_configs`/etc. A amarração é uma **FK composta** incluindo o próprio tipo:

```sql
FOREIGN KEY (resource_id, organization_id, resource_type)
    REFERENCES hawkdot.resources (id, organization_id, resource_type)
```

Isso garante, no próprio banco, que uma linha de `domain_resources` só pode apontar para uma `resources` com `resource_type = 'domain'` — mas exige que a aplicação grave o mesmo tipo nos dois lugares.

**O padrão** (referência: `src/controllers/resource.controller.ts`, tipo `domain`):

1. Gerar o `id` do recurso na aplicação (`randomUUID()`) — não `gen_random_uuid()` do banco, porque a filha precisa desse id antes de existir.
2. Dentro da mesma `withTenant()`, inserir o pai (`createResourceParent`) e depois a filha (`createDomainResource`) com o **mesmo** `resourceType`/`resource_type` nos dois.
3. Tipo incoerente entre pai e filha é barrado pela FK composta — vira 400/409 traduzido normalmente pelo `translatePrismaError` (#6), não precisa de validação manual extra.
4. Update/delete seguem o mesmo padrão de duas chamadas na mesma transação; `ON DELETE CASCADE` cuida da filha quando o pai é removido.

**Diferente do bootstrap do signup (#14) e do aceite de convite (#24), aqui não há problema de `RETURNING`**: quem cria/lê/atualiza um recurso já é membro ativo da organização (passou por `requireRole` ou pelo menos por `withSession`), então `tenant_app_select` já enxerga a linha sem a circularidade daqueles dois casos — os models usam `.create()`/`.update()` normais do Prisma, sem precisar do workaround de `$executeRaw` sem `RETURNING`.

# Paginação e índices de listagem (#32)

`GET /api/resources` e `GET /api/monitors` usam offset/limit (`dto.paginacao`, `page`/`per_page`) — estratégia mais simples que cursor e suficiente para o volume do MVP; cursor fica para quando a paginação por offset começar a doer de verdade (fica registrado aqui para não ser esquecido).

Verificado com `EXPLAIN (COSTS OFF)` contra o banco real, como `hawkdot_api_login` com contexto de tenant setado: as duas queries de listagem usam `Bitmap Index Scan` nos índices já existentes (`resources_org_type_status_idx`, `monitors_org_state_idx`) pela coluna `organization_id` — que a RLS sempre injeta automaticamente no filtro. Os demais filtros (`resource_type`/`status`/`environment`, `current_state`) aparecem como `Filter` pós-scan nesse volume de dados pequeno do ambiente de teste; o índice composto continua disponível para o planner usar mais das colunas líderes à medida que o volume cresce.
