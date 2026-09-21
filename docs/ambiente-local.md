# Ambiente local: do clone à primeira checagem

[Índice](README.md) · [Diagnóstico](operacao.md)

## 1. Pré-requisitos

Use um Node compatível com as dependências instaladas: Prisma exige `^20.19`, `^22.12` ou `>=24.0`; Next exige `>=20.9`. Node 22.12+ da linha 22 atende ambos. Tenha npm, Git, Docker com Compose e, para checks ICMP, o binário Linux `ping` (pacote `iputils-ping` em Debian/Ubuntu). O executor interpreta a saída inglesa de `ping`; mantenha locale compatível. Os scripts de banco usam Bash.

```bash
git clone https://github.com/Bert00100/hawkdot.git
cd hawkdot
npm ci
docker compose -f docker/docker-compose.yml up -d
docker exec hawkdot-PSQL pg_isready -U adm -d hawkdot
```

O Compose sobe somente o PostgreSQL 17, porta 5432 e volume persistente. Next e worker rodam separadamente. As credenciais administrativas do Compose são de desenvolvimento; veja [o arquivo](../docker/docker-compose.yml). Não use `adm` na aplicação.

## 2. Inicialize um banco vazio

```bash
docker exec -i hawkdot-PSQL psql -v ON_ERROR_STOP=1 -U adm -d hawkdot < db/hawkdot_postgresql17_schema.sql
```

**Execute o schema completo apenas em banco vazio.** Ele cria tipos/tabelas sem `IF NOT EXISTS`; reaplicar em banco já inicializado falha. Não apague um banco com dados para corrigir isso. Atualizações exigem SQL incremental, conforme [banco](banco.md).

Abra o console administrativo:

```bash
docker exec -it hawkdot-PSQL psql -U adm -d hawkdot
```

Dentro do psql, crie os logins uma única vez e defina senhas pelos prompts:

```sql
CREATE ROLE hawkdot_api_login LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT hawkdot_app TO hawkdot_api_login;
\password hawkdot_api_login
CREATE ROLE hawkdot_worker_login LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT hawkdot_worker TO hawkdot_worker_login;
\password hawkdot_worker_login
\q
```

Se os logins já existirem, confira os grants e ajuste senhas; não repita `CREATE ROLE`. Roles são compartilhados entre os bancos do mesmo servidor.

## 3. Configure `.env`

Crie `.env` na raiz. Substitua os marcadores abaixo; senhas com caracteres especiais precisam de percent-encoding na URL (por exemplo, `@` vira `%40`). Não versione o arquivo.

```dotenv
DATABASE_URL=postgresql://hawkdot_api_login:SENHA_API@localhost:5432/hawkdot
DATABASE_URL_WORKER=postgresql://hawkdot_worker_login:SENHA_WORKER@localhost:5432/hawkdot
DATABASE_URL_TEST=postgresql://hawkdot_api_login:SENHA_API@localhost:5432/hawkdot_test
DATABASE_URL_TEST_ADMIN=postgresql://adm:SENHA_ADMIN_CODIFICADA@localhost:5432/hawkdot_test
DATABASE_URL_WORKER_TEST=postgresql://hawkdot_worker_login:SENHA_WORKER@localhost:5432/hawkdot_test
JWT_SECRET=SUBSTITUA_POR_UM_SEGREDO_ALEATORIO
JWT_TTL_SECONDS=3600
CREDENTIAL_ENCRYPTION_KEY=SUBSTITUA_POR_64_CARACTERES_HEXADECIMAIS
```

Rode o comando abaixo **duas vezes**, usando uma saída para cada segredo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variável | Quando é necessária |
|---|---|
| `DATABASE_URL` | Sempre, login restrito da API |
| `JWT_SECRET` | Sempre, pelo menos 32 caracteres |
| `CREDENTIAL_ENCRYPTION_KEY` | Sempre, exatamente 64 caracteres hex; protege segredos salvos |
| `JWT_TTL_SECONDS` | Opcional, padrão 3600 segundos |
| `DATABASE_URL_WORKER` | Execução normal do worker |
| `DATABASE_URL_TEST`, `DATABASE_URL_TEST_ADMIN` | Jest e E2E; exclusivamente `hawkdot_test` |
| `DATABASE_URL_WORKER_TEST` | Testes do worker e E2E |
| `NEXT_DIST_DIR` | Opcional: `.next`, `.next-e2e` ou `.next-build` |
| `NODE_ENV` | Gerenciado pelo comando/framework; não fixe `test` no `.env` de uso diário |

A validação está em [env.ts](../src/config/env.ts). Scripts de infraestrutura e configuração de ferramentas podem carregar o ambiente diretamente; código da aplicação deve importar `env`.

## 4. Gere o client e inicie os processos

```bash
npx prisma generate --config prisma7.config.ts
npm run dev
```

O nome da configuração é **`prisma7.config.ts`**, por isso o argumento explícito. O client gerado em `src/generated/prisma/` não é versionado. `npm ci` sozinho não substitui esta etapa.

Em outro terminal, na mesma raiz:

```bash
npm run worker
```

Abra `http://localhost:3000/signup`, crie uma conta e entre em `/login`. O endpoint de signup cria usuário, organização e vínculo owner; não cria cookie de sessão por si só. A interface faz o fluxo seguinte.

```bash
curl -i http://localhost:3000/api/health
```

Health confirma API/banco, não o worker. Cadastre um endpoint em **Recursos**, depois crie um monitor **HTTP**, informando também a URL na configuração do check. Recurso é o alvo cadastrado; monitor é a tarefa que o verifica. Aguarde uma execução e o polling da tela (15s). Confira `last_execution`/horário da última checagem.

## 5. Prepare os testes

Confirme que todas as URLs de teste apontam para `hawkdot_test`. O comando seguinte **apaga e recria o banco de testes**; não rode enquanto Jest/E2E estiverem usando-o:

```bash
npm run db:test:setup
npm test -- --runInBand
```

O script não cria senhas de login e não preenche `.env`. Veja [testes](testes.md) para navegador e verificações antes do commit.
