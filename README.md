# hawkdot

**Monitoramento de infraestrutura open source, para executar no seu próprio ambiente.**

Acompanhe a disponibilidade de endpoints HTTP, a validade de certificados SSL e a
conectividade de hosts por ping. O hawkdot reúne uma interface web, uma API e um
worker que executa checagens periódicas, registra resultados e acompanha incidentes.

O projeto suporta múltiplas organizações, com permissões por papel e isolamento de
dados no PostgreSQL. Está em desenvolvimento: confira o escopo atual abaixo antes
de planejar uma instalação.

[Começar](#como-executar-localmente) · [Documentação](docs/README.md) ·
[API](docs/api.md) · [Contribuir](#como-contribuir) ·
[Issues](https://github.com/Bert00100/hawkdot/issues)

## O que você pode fazer hoje

- **Monitorar HTTP:** configurar método, headers, corpo, faixa de status esperada,
  conteúdo da resposta e redirecionamentos.
- **Verificar SSL:** acompanhar validade do certificado, cadeia de confiança,
  hostname e faixas de aviso de vencimento.
- **Testar conectividade:** executar ping e definir tolerância de perda de pacotes.
- **Gerenciar recursos e monitores:** cadastrar domínios, IPs e endpoints; buscar,
  filtrar, paginar, editar e pausar monitores pela interface.
- **Acompanhar incidentes:** confirmar quedas e recuperações com limites de falhas
  e sucessos consecutivos, mantendo registros de execução e eventos.
- **Separar equipes:** organizar dados por organização e controlar acesso com os
  papéis owner, admin, operator e viewer.

A API também oferece gestão de membros, credenciais cifradas, auditoria, canais e
regras de notificação. Consulte os contratos e exemplos na [referência HTTP](docs/api.md).

### Estado atual e funcionalidades pendentes

| Área | Situação |
|---|---|
| Interface web | Login, cadastro, visão geral, recursos e monitores disponíveis |
| Checagens | HTTP, SSL e ping executados pelo worker |
| Incidentes | Abertura e resolução automáticas; reconhecimento pela API |
| Notificações | Motor de regras, Telegram, webhook e retry implementados; acionamento automático ainda pendente |
| Equipe e notificações na interface | Telas ainda pendentes; itens do menu desabilitados |
| Histórico e uptime | Execuções persistidas; sem cálculo de uptime histórico ou API de histórico completo |
| Outros tipos de monitor | Há estruturas no banco, mas não executores disponíveis no MVP |

Criar um canal ou regra ainda **não ativa o envio automático**. Veja o
[guia de worker e notificações](docs/worker-notificacoes.md) para entender essa integração.

## Como executar localmente

Você precisa de Node.js compatível com as dependências (por exemplo, **22.12+ na
linha 22**), npm, Git e Docker com Compose. Checks de ping também precisam do
binário Linux `ping` e permissão para ICMP.

### 1. Obtenha o código e prepare o ambiente

```bash
git clone https://github.com/Bert00100/hawkdot.git
cd hawkdot
npm ci
cp .env.example .env
```

Se já tiver um `.env`, preserve sua configuração. O [arquivo de exemplo](.env.example)
contém marcadores: preencha as URLs com seus logins de banco e gere valores
independentes para `JWT_SECRET` e `CREDENTIAL_ENCRYPTION_KEY`. Não versione segredos.

### 2. Configure o PostgreSQL

```bash
docker compose -f docker/docker-compose.yml up -d
```

O Compose inicia **somente o banco**. Antes de subir a aplicação, siga as etapas de
[inicialização do schema, criação dos logins e configuração do ambiente](docs/ambiente-local.md).
Elas são necessárias: o container sozinho não cria toda a estrutura da aplicação.

O SQL completo deve ser aplicado uma única vez em banco vazio. API e worker usam
logins restritos diferentes; `adm` fica reservado à administração e aos testes.

### 3. Inicie a aplicação e o worker

Depois de configurar o banco e o `.env`:

```bash
npx prisma generate --config prisma7.config.ts
npm run dev
```

Em outro terminal, na raiz do projeto:

```bash
npm run worker
```

Abra [localhost:3000/signup](http://localhost:3000/signup), crie sua conta e faça
login. Cadastre um recurso e, depois, um monitor com a configuração de checagem.
A interface atualiza os monitores a cada 15 segundos enquanto a aba está visível.

**O worker precisa permanecer ativo para executar checagens.**
[GET /api/health](http://localhost:3000/api/health) verifica a API e o banco;
não confirma a atividade do worker.

Para instruções completas e solução de problemas, consulte
[ambiente local](docs/ambiente-local.md) e [operação e diagnóstico](docs/operacao.md).

## Tecnologias e arquitetura

| Parte | Tecnologias |
|---|---|
| Interface | React 19, Next.js 16 App Router, TypeScript e CSS |
| API | Route Handlers, Zod e controllers por caso de uso |
| Dados | PostgreSQL 17, Prisma 7 e adapter PostgreSQL |
| Autenticação | Argon2id, JWT e cookie httpOnly |
| Monitoramento | Worker Node.js independente do servidor web |
| Testes | Jest com PostgreSQL real e Playwright em desktop/mobile |

O backend segue a direção `rota → controller → model → Prisma`. O isolamento entre
organizações usa **Row-Level Security (RLS)** no banco, com contexto definido por
transação. O frontend consome a API por clientes HTTP tipados e hooks.

```text
src/app/             Páginas, layouts e rotas HTTP
src/components/      Componentes da interface
src/hooks/           Sessão, carregamento e atualização dos dados
src/lib/api/         Cliente HTTP e tipos do frontend
src/controllers/     Regras de negócio e autorização
src/models/          Acesso a dados
src/lib/             Validação, erros, autenticação e contexto de tenant
src/worker/          Agendamento, checks, incidentes e eventos
src/notifications/   Regras de entrega e adapters
db/                 Schema SQL, constraints, grants e policies
docs/               Guias de uso, desenvolvimento e operação
```

Consulte o [mapa de arquitetura](docs/arquitetura.md) e as
[convenções do projeto](AGENTS.md) antes de alterar os fluxos. Para mudanças no
Next.js, leia também os guias da versão instalada em `node_modules/next/dist/docs/`.

## Documentação

Os guias explicam onde mexer e como validar uma alteração, com caminhos para os
arquivos e exemplos práticos.

| Quero… | Guia |
|---|---|
| Começar do zero | [Ambiente local](docs/ambiente-local.md) |
| Entender a organização do projeto | [Arquitetura](docs/arquitetura.md) |
| Desenvolver endpoints e regras de negócio | [Backend](docs/backend.md) |
| Criar ou alterar telas | [Frontend](docs/frontend.md) |
| Integrar com a API | [Referência HTTP](docs/api.md) |
| Alterar dados, permissões ou schema | [Banco e RLS](docs/banco.md) |
| Trabalhar em checks ou entregas | [Worker e notificações](docs/worker-notificacoes.md) |
| Implementar uma funcionalidade passo a passo | [Receitas de alteração](docs/como-alterar.md) |
| Validar uma contribuição | [Testes](docs/testes.md) |
| Investigar uma falha | [Operação e diagnóstico](docs/operacao.md) |

O [índice completo](docs/README.md) também oferece trilhas de leitura para backend e frontend.

## Testes e comandos úteis

Configure primeiro as URLs de teste do `.env`, apontando exclusivamente para
`hawkdot_test`. O comando de preparação abaixo **apaga e recria esse banco**:

```bash
npm run db:test:setup
npm test -- --runInBand
```

Para os testes de navegador:

```bash
npx playwright install chromium
npm run test:e2e
```

Execute Jest e Playwright separadamente: eles compartilham o banco de testes.
Os testes de dados usam PostgreSQL real para verificar RLS, constraints e transações.

| Comando | Finalidade |
|---|---|
| `npm run dev` | Interface e API em desenvolvimento |
| `npm run worker` | Processo de checagens |
| `npm run lint` | Verificação com ESLint |
| `npm run test:watch` | Testes em modo watch |
| `npm run test:coverage` | Relatório de cobertura |
| `npx next typegen` | Geração de tipos das rotas |
| `npx tsc --noEmit` | Verificação de tipos |
| `npm run build` / `npm run start` | Build e execução do servidor web |

O build não inicia o worker. Para detalhes de execução fora do ambiente de
desenvolvimento, consulte o [guia de operação](docs/operacao.md).

## Como contribuir

Contribuições de código, documentação, testes e relatos de problemas são bem-vindas.

1. Consulte as [issues](https://github.com/Bert00100/hawkdot/issues). Para mudanças
   maiores, descreva o problema e a proposta em uma issue antes de implementar.
2. Faça um fork, crie uma branch para sua alteração e configure o ambiente local.
3. Leia as [convenções](AGENTS.md) e o [guia de alteração](docs/como-alterar.md).
   Para mudanças de comportamento, escreva primeiro um teste que reproduza o caso.
4. Execute as verificações adequadas e atualize a documentação afetada.
5. Abra um pull request explicando o problema, o comportamento resultante, os
   testes executados e qualquer alteração necessária no banco.

Ao relatar um bug, inclua passos para reproduzir, comportamento esperado e observado,
versões e mensagens de erro sem senhas, tokens ou dados privados. Não inclua `.env`,
artefatos de build ou o client Prisma gerado em uma contribuição.

## Licença

O hawkdot é desenvolvido com a proposta de ser open source. O repositório ainda
não contém um arquivo `LICENSE`; a licença de distribuição está pendente de definição.
