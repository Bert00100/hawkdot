# Receitas para implementar mudanças

[Índice](README.md) · [Testes](testes.md)

## Adicionar um campo de ponta a ponta

Exemplo: um novo atributo editável de recurso.

1. Decida se é comum (resources) ou específico (tabela filha). Defina tipo, default e compatibilidade com dados existentes.
2. Escreva teste de controller/model que falhe pelo comportamento ausente; inclua tenant diferente e papel sem permissão quando aplicável.
3. Atualize SQL base e prepare atualização incremental, se houver persistência nova. Atualize Prisma e gere client.
4. Adicione/reutilize primitiva em common.ts e inclua campo no DTO de criação e atualização. O campo obrigatório em criação pode ser opcional no PATCH.
5. Passe o valor pelo controller até o model e inclua apenas o necessário na resposta.
6. Atualize tipos de `src/lib/api/`, payload de formulário e apresentação. Trate registros antigos/null e erro de campo.
7. Verifique teste direcionado, isolamento e navegador. Atualize contrato/documentação na mesma mudança.

Se o campo for apenas visual (ex.: texto de ajuda), altere componente/CSS; não invente coluna ou endpoint.

## Criar um endpoint

Use [a rota de monitores](../src/app/api/monitors/route.ts) como molde, não copie imports sem ajustar:

1. Defina URL plural, método, DTO, formato de retorno e papéis.
2. Escreva testes de rota/controller contra banco real para sucesso, validação, sessão ausente, papel proibido e outro tenant.
3. Crie funções model recebendo `TenantClient`; use nomes como `find...`, `create...`, `list...`.
4. Crie controller pelo caso de uso, com `requireRole`, coordenação e retorno seguro. Inclua auditoria se for ação sensível.
5. Na rota, use parseBody/parseQuery, handleRoute, withSession e okResponse. HTTP fica apenas na borda.
6. Para `[id]`, use params assíncronos e gere tipos: `npx next typegen` antes de `npx tsc --noEmit`.
7. Registre endpoint em [API](api.md) e crie cliente HTTP se houver consumidor frontend.

Helpers específicos de recurso ficam na camada dele. `src/lib/` é transversal. Nunca instancie PrismaClient num endpoint.

## Criar uma tela

1. Confira se o endpoint já existe e seus filtros/papéis. Não presuma que toda tabela tem API.
2. Crie página em `(dashboard)` ou `(auth)`. Separe formulário/linha reutilizável em components.
3. Adicione tipos e chamadas em `src/lib/api/`; encapsule estado remoto em hook quando necessário.
4. Apresente loading inicial, vazio, erro, tentativa novamente e sucesso. Aborte respostas antigas e preserve rascunho durante refresh.
5. Ligue busca/paginação à API e adicione navegação apenas quando a página funcionar.
6. Verifique 401, 403, validação de campos, teclado, mobile e ações fora da primeira página.

## Criar um tipo de monitor/check

A presença no enum SQL não basta. Atualize DTO discriminado, model/config, controller, tipos HTTP, formulário e executor. Confira tabela filha/FK/grants existentes e tipos aceitos pelo scheduler. Use CheckExecutor/CheckResult em `src/worker/checks/types.ts` e registre em run-check/execute-monitor. Reutilize persistência e máquina de estado, sem fazer gravações de banco no executor.

Teste sucesso, falha, timeout real, configuração inválida, resultado obsoleto, monitor pausado durante I/O e RLS. Leia o fluxo inteiro antes de adicionar mais um ramo por tipo; server_agent, por exemplo, possui semântica própria não implementada.

## Criar um canal de notificação

Defina DTO/config, armazenamento e segredo cifrado; adicione suporte no controller/model e implemente ChannelAdapter. Registre o adapter no dispatcher. Teste payload, timeout, resposta de erro, segredo sanitizado e falha sem interromper os outros canais. Atualize API e UI quando existirem. Não confunda adapter novo com resolução da integração automática pendente do motor.

## Antes de entregar

Revise diff, arquivos gerados/segredos, compatibilidade de DTO/resposta, papel restrito, teste relevante e instruções de atualização de banco. Rode os [comandos adequados](testes.md). Descreva comportamento antes/depois e testes realmente executados. Não reporte o relatório histórico de QA como resultado da sua execução atual.
