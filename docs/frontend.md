# Frontend: páginas, estado e integração

[Índice](README.md) · [API](api.md) · [Receitas](como-alterar.md)

## Mapa de telas

| URL | Arquivo em `src/app/` | Responsabilidade |
|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Autenticar e tratar erro de login |
| `/signup` | `(auth)/signup/page.tsx` | Cadastrar pessoa e organização |
| `/` | `(dashboard)/page.tsx` | Visão geral dos dados carregados |
| `/resources` | `(dashboard)/resources/page.tsx` | Buscar, filtrar, paginar e gerenciar recursos |
| `/monitors` | `(dashboard)/monitors/page.tsx` | Buscar, filtrar, paginar e gerenciar monitores |
| `/monitors/new` | `(dashboard)/monitors/new/page.tsx` | Escolher recurso e criar monitor |
| `/monitors/[id]` | `(dashboard)/monitors/[id]/page.tsx` | Consultar e editar monitor/config |

Parênteses definem grupos de rotas e não aparecem na URL. `src/app/layout.tsx` define o layout global. `(dashboard)/layout.tsx` carrega sessão, sidebar e topbar. A proteção visual não substitui autorização da API.

Antes de alterar comportamento do Next, leia os guias da versão instalada em `node_modules/next/dist/docs/`, sobretudo `01-app/01-getting-started/02-project-structure.md`, `05-server-and-client-components.md` e `15-route-handlers.md`. Páginas/layouts são server components por padrão; as telas interativas atuais declaram `"use client"`. Não importe conexão, segredo ou model em código que roda no navegador.

## Caminho dos dados

`página → hook → src/lib/api/<recurso>.ts → apiClient → /api/...`

- [client.ts](../src/lib/api/client.ts) envia cookies same-origin, JSON e `cache: no-store`; suporta 204 sem tentar ler JSON.
- [types.ts](../src/lib/api/types.ts) descreve respostas para a UI; datas são strings, campos sem resultado podem ser `null`.
- [use-remote-data.ts](../src/hooks/use-remote-data.ts) trata loading, erro, reload e aborta respostas obsoletas.
- [use-monitors.ts](../src/hooks/use-monitors.ts) atualiza lista/detalhe a cada 15 segundos com aba visível.
- [use-resources.ts](../src/hooks/use-resources.ts) carrega recursos sem polling periódico.
- [use-session.ts](../src/hooks/use-session.ts) usa `/api/me`, trata logout e redireciona em sessão expirada.

Para um novo hook, mantenha a função `load` estável com `useCallback` e encaminhe `AbortSignal`. Se ela mudar a cada render, disparará carregamentos desnecessários. Após mutação, aguarde a API e atualize/recarregue a lista; apresente falhas ao usuário.

`loading` significa ausência do primeiro conjunto de dados; `refreshing` também cobre atualização com dados anteriores visíveis. Evite apagar toda a tela em cada polling. Não sobrescreva rascunho de formulário quando chegar dado novo do servidor.

## Formulários e feedback

Use [resource-form-modal.tsx](../src/components/resources/resource-form-modal.tsx) para recursos e [monitor-config-fields.tsx](../src/components/monitors/monitor-config-fields.tsx) para campos SSL/HTTP/ping. `FieldErrors` apresenta `ApiError.details`. Separe erros de campo de erros gerais de carregamento/ação.

O GET pode devolver `null` em campos opcionais; o DTO de escrita pode aceitar apenas string ou ausência. Monte o payload com os campos editáveis, sem reenviar o objeto inteiro do GET. Em monitores, não envie `current_state`, contadores ou `last_execution`. `resource_id` e `monitor_type` não mudam no PATCH.

Listas editáveis como `warning_days` devem manter texto durante digitação (inclusive vírgula final) e converter/validar no momento adequado. Desabilite envio enquanto aguarda resposta; falha não deve apagar os valores preenchidos.

## Busca, paginação e dados ausentes

A busca `q` é feita no banco antes da paginação. Envie filtros ao backend; filtrar apenas os 20 itens locais produz resultados incompletos. Ao mudar filtro/busca, volte à página 1. `per_page` tem teto 100. O seletor de recurso na criação de monitor também precisa navegar páginas.

Não represente `last_execution: null` como sucesso nem latência zero. Monitor novo fica aguardando a primeira execução. `uptime-bar.tsx` não é evidência de uma API de histórico: não invente pontos ou calcule disponibilidade histórica a partir do estado atual. A visão geral carrega até 100 monitores; confira o escopo de cada contador antes de apresentá-lo como estatística global.

## Estilos e acessibilidade

Estilos compartilhados e responsivos vivem em [globals.css](../src/app/globals.css). Componentes reutilizáveis ficam em `src/components/ui/`: modal, ícone, badge, tag, erros. Navegação fica em `src/components/layout/`.

Ao alterar uma tela, verifique desktop e celular, labels de inputs, foco visível, abertura/fechamento de modal por teclado, Escape, rolagem e visibilidade de ações destrutivas. Reutilize `Modal`, que já trata foco. Adicionar um ícone exige atualizar o conjunto/tipo em `icon.tsx`.

Para nova tela, crie a página no grupo adequado, cliente HTTP tipado, hook quando necessário e link na sidebar. Equipe e notificações continuam como itens desabilitados até haver telas funcionais; não transforme o placeholder em link quebrado.
