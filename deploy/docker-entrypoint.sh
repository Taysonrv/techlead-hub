#!/bin/sh
set -eu

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[startup] Aplicando migrations pendentes..."
  (cd /app/backend && ./node_modules/.bin/prisma migrate deploy)
fi

exec node /app/backend/dist/server.js
