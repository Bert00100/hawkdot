# Backend: onde colocar cada mudança

[Índice](README.md) · [API](api.md) · [Banco](banco.md)

## Siga um endpoint existente

Use a criação de monitor como exemplo completo:

1. [route.ts](../src/app/api/monitors/route.ts) lê JSON com `parseBody(createMonitorSchema, request)` e metadados da requisição.
2. [monitor.dto.ts](../src/lib/dto/monitor.dto.ts) discrimina `monitor_type` e exige a configuração correspondente.
3. `withSession` verifica JWT e abre a transação de tenant.
4. [monitor.controller.ts](../src/controllers/monitor.controller.ts) verifica papel, cria pai/config vinculados ao recurso e grava auditoria.
5. [monitor.model.ts](../src/models/monitor.model.ts) e [monitor-config.model.ts](../src/models/monitor-config.model.ts) fazem operações por `tx`.
6. A rota devolve os dados com status 201. `handleRoute` converte exceções para o contrato de erro.

## Responsabilidades

| Camada | Coloque aqui | Não coloque aqui |
|---|---|---|
| Rota | Request, params, query, JSON, cookies, status e headers | Prisma, SQL, decisão de negócio |
| DTO | Tipos de entrada e restrições de formato/faixa | Acesso ao banco |
| Controller | Autorização, caso de uso, coordenação de models, resposta segura | NextResponse, SQL, novo PrismaClient |
| Model | Uma função por operação de dados com `tx` | Decisão de papel, HTTP, acesso sem contexto |
| Config | Ambiente e conexão | Regras de recurso |

`parseBody` trata também JSON malformado. `parseQuery` valida URL. Atualizações rejeitam objeto vazio. Reutilize primitivas de [common.ts](../src/lib/dto/common.ts); novas primitivas que espelham CHECK devem citar o constraint e ter teste contra Postgres.

A atualização de configuração de monitor tem uma particularidade: a rota valida o objeto externo, mas o controller só pode escolher o schema específico após ler o `monitor_type` persistido. Não tente descobrir o tipo confiando no cliente.

## Sessão e papéis

O cookie `hawkdot_session` é httpOnly, SameSite=Lax, path `/` e Secure em produção. JWT dura uma hora por padrão. O navegador não lê token nem o guarda em localStorage. `withSession` é o caminho usual das rotas protegidas. Signup, login, troca de organização e aceite de convite têm fluxos próprios; veja [auth.controller.ts](../src/controllers/auth.controller.ts).

| Operação | Papéis ativos permitidos |
|---|---|
| Ler recursos, monitores, canais, regras, organização e membros | owner, admin, operator, viewer |
| Escrever recursos, monitores, canais, regras; reconhecer incidente | owner, admin, operator |
| Alterar organização, convidar/alterar/remover membros | owner, admin |
| Criar/listar/excluir credenciais; ler auditoria | owner, admin |

Controllers usam `requireRole` para mensagem 403 clara; RLS continua sendo a barreira no banco. Admin não pode alterar/remover um owner existente. O último owner ativo não pode ser removido/rebaixado. Confira [organization-member.role.controller.ts](../src/controllers/organization-member.role.controller.ts) para os detalhes efetivamente aplicados.

Convite exige conta já existente. Aceite atua apenas no próprio convite. Aceitar não muda automaticamente a organização do JWT: use `/api/auth/switch-organization` depois. Logout apaga cookie, mas não revoga token já emitido; não há tabela de sessões, refresh token ou logout global.

## Erros e respostas

Sucesso devolve objeto/array diretamente; listagens paginadas usam `{items, page, per_page, total}`. Exclusões atuais devolvem HTTP 200 com `{ok: true}`. O cliente HTTP também suporta 204, mas isso não significa que os handlers atuais o usem.

```json
{"error":{"code":"VALIDATION_ERROR","message":"Dados invalidos.","details":[{"field":"name","message":"Informe o nome."}]}}
```

| Código | HTTP | Tratamento esperado no cliente |
|---|---|---|
| VALIDATION_ERROR | 400 | Mostrar mensagem e erros de campo |
| UNAUTHENTICATED | 401 | Pedir login |
| FORBIDDEN | 403 | Informar falta de permissão |
| NOT_FOUND | 404 | Recurso ausente ou invisível ao tenant |
| CONFLICT | 409 | Informar duplicidade/conflito |
| INTERNAL_ERROR | 500 | Mensagem genérica; investigar logs |
| SERVICE_UNAVAILABLE | 503 | Serviço indisponível; tentar novamente |

Lance fábricas de `src/lib/errors`, nunca `NextResponse` no controller. `prisma.ts` traduz unique, CHECK, FK e registro ausente. Cadastre mensagens amigáveis para constraints novos; nunca devolva SQL, valores secretos ou a mensagem bruta do driver.

## Auditoria e transação

A rota extrai IP/user agent com `extractRequestMeta`; controller recebe dados simples e chama `recordAudit` dentro da transação da operação. Se falhar, operação e auditoria fazem rollback juntas. Monte `beforeData`/`afterData` explicitamente: nunca serialize a credencial inteira. Auditoria usa insert sem RETURNING por causa da assimetria entre permissão de gravar e ler.

Mantenha I/O externo demorado fora de transações de dados sempre que desenhar um novo fluxo. O worker já separa rede de persistência. O despacho de notificações atual recebe uma transação e ainda faz rede nela; não copie isso como padrão geral (ver limites no [guia](worker-notificacoes.md)).
