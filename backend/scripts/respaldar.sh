#!/usr/bin/env bash
# Respaldo completo de Gastro-AI (RNF-26): base de datos, archivos de MinIO, pesos del
# modelo (si HF_PESOS_ARCHIVO está configurado) y un manifiesto pa verificar al restaurar.
#
# Se corre desde la carpeta del docker-compose, con el stack arriba:
#   backend/scripts/respaldar.sh                      # deja todo en ./respaldos/
#   backend/scripts/respaldar.sh /srv/respaldos       # en otra carpeta
#   COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml" \
#     backend/scripts/respaldar.sh /srv/respaldos      # producción
#   RESPALDOS_A_CONSERVAR=7 …                         # borra los más viejos (opcional)
#
# OJO: el respaldo trae seudónimos, hashes, imágenes y la bitácora: es dato personal
# protegido (Ley 1581). Queda solo legible por el dueño (umask 077); guárdalo cifrado y
# fuera del servidor.
set -euo pipefail
umask 077

COMPOSE=${COMPOSE:-docker compose}
DESTINO=${1:-respaldos}
carpeta="$DESTINO/gastroai-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$carpeta"
trap 'echo "El respaldo no terminó: se borra $carpeta" >&2; rm -rf "$carpeta"' ERR

api() { $COMPOSE exec -T api python -m scripts.respaldo "$@"; }
sin_fecha() { grep -v '"creado_en"' "$1"; }

echo "1/4 Base de datos…"
# El manifiesto se toma antes y después del pg_dump: si algo cambió en medio (un login,
# un análisis), se repite pa que el manifiesto describa exactamente lo que quedó en el dump
for intento in 1 2 3; do
  api manifiesto > "$carpeta/antes.json"
  $COMPOSE exec -T postgres sh -c \
    'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    > "$carpeta/base.dump"
  api manifiesto > "$carpeta/despues.json"
  if diff -q <(sin_fecha "$carpeta/antes.json") <(sin_fecha "$carpeta/despues.json") > /dev/null; then
    break
  fi
  if [ "$intento" = 3 ]; then
    echo "La base cambió durante el respaldo tres veces seguidas; inténtalo con menos uso." >&2
    false
  fi
  echo "   La base cambió mientras se respaldaba; se repite ($intento/3)."
done

echo "2/4 Archivos de MinIO…"
api exportar-archivos > "$carpeta/archivos.tar" 2> "$carpeta/archivos.log"
grep -v '^RESUMEN ' "$carpeta/archivos.log" >&2 || true
resumen=$(grep '^RESUMEN ' "$carpeta/archivos.log" | cut -c9-)

echo "3/4 Pesos del modelo…"
codigo=0
api exportar-pesos > "$carpeta/pesos.bin" || codigo=$?
if [ "$codigo" = 3 ]; then
  rm -f "$carpeta/pesos.bin"
elif [ "$codigo" != 0 ]; then
  echo "No se pudieron copiar los pesos." >&2
  false
fi

echo "4/4 Manifiesto y huellas…"
{ printf '{"manifiesto":'; cat "$carpeta/despues.json"; printf ',"archivos":%s}' "$resumen"; } \
  | api unir > "$carpeta/manifiesto.json"
rm -f "$carpeta/antes.json" "$carpeta/despues.json" "$carpeta/archivos.log"
( cd "$carpeta" && sha256sum -- * > SHA256SUMS )
trap - ERR

if [ -n "${RESPALDOS_A_CONSERVAR:-}" ]; then
  ls -1d "$DESTINO"/gastroai-* | sort | head -n "-$RESPALDOS_A_CONSERVAR" | while read -r viejo; do
    echo "Se borra el respaldo viejo $viejo"
    rm -rf "$viejo"
  done
fi

echo "Respaldo listo en $carpeta"
