# Testes e validação

[Índice](README.md) · [Ambiente](ambiente-local.md)

## Banco real e isolamento entre suítes

Jest usa PostgreSQL real em `hawkdot_test`. Testes ficam ao lado da implementação. `src/test-utils/admin-client.ts` popula dados como administrador; `app-client.ts` e os wrappers executam o comportamento sob RLS. Factories estão em `factories.ts`. `cleanDatabase()` faz TRUNCATE global das tabelas de teste: URLs de teste nunca devem apontar para banco de uso local ou produção.

O [jest.config.mjs](../jest.config.mjs) limita maxWorkers a 1 porque as suítes compartilham banco e limpeza. Não rode Jest e Playwright simultaneamente. Mockar Prisma esconderia regressões de CHECK, FK e RLS. Mocks de transporte/controladores usados por testes específicos não autorizam substituir o banco dos testes de dados.

## Ciclo de trabalho

```bash
npm run test:watch
```

Escreva o caso que falha, implemente e execute primeiro o arquivo afetado:

```bash
npm test -- --runInBand src/controllers/monitor.controller.list.test.ts
```

Para preparar/reinicializar **somente o banco descartável**:

```bash
npm run db:test:setup
```

O script usa o container hawkdot-PSQL, administrador adm e banco hawkdot_test. Aceita HAWKDOT_PG_CONTAINER, HAWKDOT_PG_SUPERUSER e HAWKDOT_TEST_DB, mas trocar TEST_DB muda o alvo de DROP DATABASE; mantenha o padrão no fluxo normal. Não precisa recriar o banco antes de todo teste, apenas quando setup/schema exigirem.

## O que testar por mudança

| Mudança | Evidência útil |
|---|---|
| DTO/CHECK | Valores válidos e limites inválidos no Zod e no Postgres |
| Query/controller | Sucesso, role restrito, organização diferente, rollback |
| Rota | JSON inválido, sessão, códigos e corpo padronizado |
| Worker | Rede lenta fora da transação, timeout, concorrência, estado e incidente |
| Notificação | Filtros, cooldown, retry, erro e segredo omitido |
| Interface | Fluxo real, erro visível, edição preservada, mobile e teclado |
| Texto/CSS simples | Inspeção pertinente; não criar teste que só repete a implementação |

Exemplos de referência: `src/lib/dto/common.test.ts`, `src/lib/tenant/isolation.test.ts`, `src/worker/execute-monitor.test.ts`, `src/notifications/delivery-engine.test.ts`.

## Navegador

```bash
npx playwright install chromium
npm run test:e2e
```

[playwright.config.ts](../playwright.config.ts) executa Chromium desktop e emulação Pixel 7, um worker por vez. [run-e2e.ts](../scripts/run-e2e.ts) inicia Next na 3100, worker próprio e alvo HTTPS local na 3443; usa `.next-e2e`, URLs exclusivas de hawkdot_test e certificado fixture confiado apenas pelos subprocessos. Deixe as portas livres. Não inicie outro servidor E2E manualmente.

[e2e/monitoring.spec.ts](../e2e/monitoring.spec.ts) cobre cadastro/login, recursos, checks, edição, polling, pausa, exclusão, busca e paginação. Contas de QA são exclusivas e limpas ao final. Artefatos ficam em test-results, com trace em falha. Emulação mobile não equivale a teste em aparelho físico ou outros motores.

## Verificação de entrega

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm test -- --runInBand
```

Adicione E2E para alterações de fluxo visual e integração. Para build isolado de um dev server ativo:

```bash
NEXT_DIST_DIR=.next-build npm run build
```

Para iniciar esse artefato depois, mantenha o mesmo NEXT_DIST_DIR no start. O build não inicia worker. Relatório de cobertura: `npm run test:coverage`.

O [QA de 20/09](qa-2026-09-20.md) registrou 433 testes/71 suítes e seis cenários E2E naquela revisão. É evidência histórica, não garantia de que o ambiente atual passou. Há registro de aviso de handles abertos do Jest; investigue conexões/timers quando ocorrer, sem mascarar falhas com forceExit.
