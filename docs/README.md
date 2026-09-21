# Documentação do hawkdot

Guia de desenvolvimento baseado no código do repositório, revisado em 21/09/2026. Comece pelo ambiente local e depois escolha a trilha da sua tarefa. Os caminhos nos guias são relativos à raiz do projeto; os links abrem o arquivo correspondente.

## Primeira semana no projeto

1. [Prepare o ambiente e faça a primeira checagem](ambiente-local.md).
2. [Entenda os conceitos e o mapa de pastas](arquitetura.md).
3. Leia [backend](backend.md) ou [frontend](frontend.md), conforme sua tarefa.
4. Consulte o [contrato HTTP](api.md) ao integrar uma tela ou endpoint.
5. Siga o [roteiro de implementação](como-alterar.md) e os [testes](testes.md).
6. Se algo falhar, use o [diagnóstico por sintoma](operacao.md).

## Índice

| Guia | O que você encontrará |
|---|---|
| [Ambiente local](ambiente-local.md) | Dependências, banco vazio, roles, `.env`, geração do client, API e worker |
| [Arquitetura](arquitetura.md) | Conceitos, fluxo completo e localização de responsabilidades |
| [Backend](backend.md) | Rotas, DTOs, controllers, models, autorização e erros |
| [Frontend](frontend.md) | Páginas, componentes, hooks, formulários, estilos e sessão |
| [API](api.md) | Todos os endpoints atuais, payloads, permissões e exemplos com curl |
| [Banco e isolamento](banco.md) | Tabelas, RLS, transações, SQL e mudanças de schema |
| [Worker e notificações](worker-notificacoes.md) | Reserva, checks, incidentes, eventos, entregas e limites |
| [Como alterar](como-alterar.md) | Receitas para tela, campo, endpoint, check e canal novos |
| [Testes](testes.md) | Jest, banco real, E2E, tipagem e critérios de revisão |
| [Operação e diagnóstico](operacao.md) | Build, processos, erros frequentes e limitações atuais |
| [QA de 20/09/2026](qa-2026-09-20.md) | Registro histórico de correções e verificações daquela execução |

## Onde mexer rapidamente

| Quero mudar… | Comece por… |
|---|---|
| Login ou cadastro visual | `src/app/(auth)/` |
| Campos da tela de monitor | `src/components/monitors/monitor-config-fields.tsx` e páginas de criação/detalhe |
| Busca, filtros ou paginação | página → hook → `src/lib/api/` → DTO → controller → model |
| Regra de permissão | controller, `src/lib/auth/require-role.ts` e policy no SQL |
| Validação de formulário/API | `src/lib/dto/` e apresentação de `ApiError.details` |
| Query de um recurso | `src/models/`, recebendo `tx` |
| Agendamento | `src/worker/run.ts`, `scheduler.model.ts` e função SQL de reserva |
| Resultado HTTP/SSL/ping | `src/worker/checks/` |
| Quando abrir incidente | `src/worker/incident-state-machine.ts` |
| Envio Telegram/webhook | `src/notifications/adapters/` |
| Layout ou cores | `src/components/layout/` e `src/app/globals.css` |

[AGENTS.md](../AGENTS.md) contém as convenções obrigatórias e decisões históricas. Estes guias explicam como aplicá-las. Quando um comentário antigo divergir da implementação, confira código e testes; divergências conhecidas estão explicitadas aqui. Não confunda uma tabela ou enum disponível no banco com uma funcionalidade pronta na API ou na interface.
