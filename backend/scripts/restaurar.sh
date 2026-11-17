#!/usr/bin/env bash
# Restaura un respaldo de respaldar.sh en un entorno LIMPIO y verifica que quedó completo
# (RNF-26): mismos conteos, bitácora idéntica entrada por entrada (RNF-05) y mismos archivos.
#
#   backend/scripts/restaurar.sh respaldos/gastroai-20261117T030000Z
#   COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml" \
#     backend/scripts/restaurar.sh /srv/respaldos/gastroai-…
#
# Se niega a correr si la base ya tiene tablas: nunca pisa una instalación en uso.
# Al terminar, arranca el resto con: $COMPOSE up -d
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose}
carpeta=${1:?Uso: restaurar.sh <carpeta del respaldo>}
api() { $COMPOSE run --rm --no-deps -T api python -m scripts.respaldo "$@"; }

echo "1/5 Revisando las huellas del respaldo…"
( cd "$carpeta" && sha256sum -c --quiet SHA256SUMS )

echo "2/5 Arrancando Postgres, Redis y MinIO…"
$COMPOSE up -d --wait postgres redis minio

tablas=$($COMPOSE exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from pg_tables where schemaname = '"'public'"'"')
if [ "$tablas" != "0" ]; then
  echo "La base ya tiene $tablas tablas: restaurar solo se hace en un entorno limpio." >&2
  exit 1
fi

echo "3/5 Base de datos…"
$COMPOSE exec -T postgres sh -c \
  'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$carpeta/base.dump"

echo "4/5 Archivos de MinIO…"
api importar-archivos < "$carpeta/archivos.tar"

echo "5/5 Verificando contra el manifiesto…"
api verificar < "$carpeta/manifiesto.json"

if [ -f "$carpeta/pesos.bin" ]; then
  echo "Los pesos del modelo están en $carpeta/pesos.bin (huella ya verificada)."
fi
echo "Restauración completa. Arranca el resto con: $COMPOSE up -d"
