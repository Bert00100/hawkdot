#!/usr/bin/env bash
# Recria do zero o banco de testes (hawkdot_test) a partir do schema SQL.
# Idempotente: pode rodar quantas vezes quiser.
#
# Uso: npm run db:test:setup

set -euo pipefail

CONTAINER="${HAWKDOT_PG_CONTAINER:-hawkdot-PSQL}"
SUPERUSER="${HAWKDOT_PG_SUPERUSER:-adm}"
TEST_DB="${HAWKDOT_TEST_DB:-hawkdot_test}"
SCHEMA_FILE="$(dirname "$0")/../db/hawkdot_postgresql17_schema.sql"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Erro: container '$CONTAINER' nao esta rodando." >&2
    echo "Suba o banco com: docker compose -f docker/docker-compose.yml up -d" >&2
    exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Erro: schema nao encontrado em $SCHEMA_FILE" >&2
    exit 1
fi

echo "==> Removendo '$TEST_DB' se existir..."
docker exec "$CONTAINER" psql -U "$SUPERUSER" -d postgres \
    -c "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE);" >/dev/null

echo "==> Criando '$TEST_DB'..."
docker exec "$CONTAINER" psql -U "$SUPERUSER" -d postgres \
    -c "CREATE DATABASE $TEST_DB;" >/dev/null

echo "==> Carregando o schema..."
docker exec -i "$CONTAINER" psql -U "$SUPERUSER" -d "$TEST_DB" -v ON_ERROR_STOP=1 \
    < "$SCHEMA_FILE" >/dev/null

TABELAS=$(docker exec "$CONTAINER" psql -U "$SUPERUSER" -d "$TEST_DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'hawkdot';")

echo "==> Pronto: '$TEST_DB' com $TABELAS tabelas no schema hawkdot."
