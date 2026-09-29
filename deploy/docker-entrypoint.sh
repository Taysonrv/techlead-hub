#!/bin/sh
set -eu

validate_required() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "[startup] Variável obrigatória ausente: $name" >&2
    exit 1
  fi
}

validate_required DATABASE_URL

if [ "${MIGRATE_ONLY:-false}" = "true" ]; then
  echo "[startup] Executando migrations de deploy..."
  cd /app/backend
  ./node_modules/.bin/prisma migrate deploy
  echo "[startup] Migrations concluídas."
  exit 0
fi

validate_required JWT_SECRET

if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  echo "[startup] AVISO: MIGRATE_ON_START é modo de compatibilidade. Prefira o serviço migrate do Docker Compose."
  (cd /app/backend && ./node_modules/.bin/prisma migrate deploy)
fi

exec node /app/backend/dist/server.js
