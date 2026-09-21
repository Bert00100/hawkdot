# Operação e diagnóstico

[Índice](README.md) · [Setup](ambiente-local.md) · [Worker](worker-notificacoes.md)

## Processos necessários

Banco, servidor Next e worker são processos independentes. O Docker Compose atual só fornece banco. Para instalação local pronta, use os comandos do setup. Para servir um build:

```bash
npm run build
npm run start
```

Mantenha o worker em outro processo com `npm run worker`. O pacote tsx usado pelo script é devDependency; um ambiente que instala apenas dependências de produção não consegue executar esse comando sem preparar outro empacotamento. Não há imagem de produção nem configuração de supervisor fornecida no repositório. Um ambiente publicado precisa configurar reinício, logs e parada dos dois processos conforme a plataforma escolhida.

Se o build foi feito com NEXT_DIST_DIR=.next-build, use `NEXT_DIST_DIR=.next-build npm run start`. Configure ambiente válido durante build/execução, HTTPS para cookie Secure e logins de banco restritos. Credenciais/chaves devem vir da configuração protegida do ambiente. Não altere CREDENTIAL_ENCRYPTION_KEY sem plano de recifragem: perder a chave impede decifrar dados existentes. Trocar JWT_SECRET invalida as assinaturas antigas.

## Diagnóstico por sintoma

| Sintoma | Verifique | Arquivo/ação |
|---|---|---|
| Falha de ambiente no boot | Variáveis obrigatórias, URL e formato de chave | src/config/env.ts; não exponha os valores em logs |
| Client Prisma não encontrado | Client gerado após clone/schema novo | `npx prisma generate --config prisma7.config.ts` |
| relation/type already exists | SQL base reaplicado em banco existente | Use atualização incremental; não apague dados para contornar |
| Connection refused | Container, porta 5432, hostname da URL | `docker compose -f docker/docker-compose.yml ps` |
| Password authentication failed | Login, senha e encoding da URL | Ajuste credencial do login correto |
| permission denied | Grants e login usado | SQL de grants; não troque por adm |
| Lista vazia apesar de dados no banco | Organização do JWT, membership ativo, contexto RLS | /api/me, withTenant e policy SELECT |
| MissingTenantContextError | Operação de modelo no client global | Passe tx do wrapper ao model |
| 401 após algum tempo | JWT expirou (1h padrão) | Login novamente; não há refresh automático |
| Login funciona local, falha em produção HTTP | Cookie Secure exige HTTPS | Configuração de entrada HTTPS |
| 403 ao editar | Papel do membro | requireRole e policies |
| 404 para UUID existente | Registro pode ser de outro tenant | Não relaxe isolamento para “encontrá-lo” |
| Recurso cadastrado não tem checks | Existe monitor separado? | Criar monitor com config e iniciar worker |
| Health 200 mas monitor não atualiza | Worker ativo, DATABASE_URL_WORKER, status/next_check_at | Logs do worker e /api/monitors/[id] |
| Ping retorna error | Binário, ICMP e saída em inglês | src/worker/checks/ping-check.ts |
| Check lento desaparece | Monitor foi pausado/excluído ou resultado ficou antigo? | lockMonitorForResult e execute-monitor |
| Tela mostra estado antigo | Aba visível, polling, 401/erro de rede | DevTools Network e use-remote-data.ts |
| PATCH de config dá 400 | Campos null/readonly enviados no payload | Monte só campos editáveis conforme DTO |
| Convite dá 404 | Email já tem conta? | Signup do convidado antes de convidar |
| Convite aceito mas tenant continua antigo | Cookie ainda aponta à organização anterior | POST /api/auth/switch-organization |
| Canal cadastrado mas nada é enviado | Motor ainda sem chamador automático | worker-notificacoes.md |
| Rota dinâmica falha no TypeScript | Tipo gerado ainda não conhece a rota | `npx next typegen` e depois tsc |
| E2E não inicia | Portas 3100/3443, Chromium, URLs hawkdot_test | playwright.config.ts e scripts/run-e2e.ts |
| Testes falham de forma intermitente | Duas suítes limpando o mesmo banco? | Serializar Jest/E2E, parar outra execução |

Para uma falha de API, registre método, URL sem segredo, status, error.code, horário e organização de teste. Depois siga rota → controller → model → policy. Compare com um teste existente. Não devolva mensagem bruta de Prisma ao navegador para facilitar debug: ela pode carregar dados do usuário.

## Limites conhecidos

- Não há uptime histórico calculado nem endpoint público de histórico completo das execuções.
- Não há retenção/expurgo automático de monitor_executions.
- Não há revogação imediata de JWT, refresh token ou sessão persistida em tabela.
- Não há envio automático integrado para os serviços de notificações nem templates detalhados.
- UI de equipe/notificações está pendente; os endpoints existentes podem ser usados via API.
- Não há execução implementada para todos os tipos previstos no schema SQL.
- A visão geral consulta até 100 monitores; não a trate como relatório histórico/global ilimitado.
- Health não verifica atividade do worker ou entrega de notificações.

Esses limites descrevem o estado atual, não são promessas de funcionalidade. Ao implementar um deles, atualize o guia, contrato e testes junto com o código.
