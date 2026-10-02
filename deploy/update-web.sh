#!/bin/sh
set -eu
VERSION="${1:?Uso: ./deploy/update-web.sh <versao>}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
READY_TIMEOUT="${READY_TIMEOUT:-120}"
export TECHLEAD_IMAGE="ghcr.io/taysonrv/techlead-hub:$VERSION"
echo "[web-update] Atualizando TechLead Hub Web para $VERSION ($TECHLEAD_IMAGE)"
docker compose -f "$COMPOSE_FILE" pull app migrate
docker compose -f "$COMPOSE_FILE" up -d postgres
docker compose -f "$COMPOSE_FILE" rm -sf migrate >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" run --rm migrate
docker compose -f "$COMPOSE_FILE" up -d --no-deps app
PORT="${TECHLEAD_PORT:-3333}"
READY_URL="http://127.0.0.1:$PORT/health/ready"
elapsed=0
while [ "$elapsed" -lt "$READY_TIMEOUT" ]; do
  if node -e "fetch('$READY_URL').then(async r=>{const j=await r.json();if(!r.ok||j.status!=='ready')process.exit(1)}).catch(()=>process.exit(1))"; then
    echo "[web-update] Versão $VERSION pronta e saudável."
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
docker compose -f "$COMPOSE_FILE" logs --tail 100 app
echo "[web-update] A versão $VERSION não ficou pronta em $READY_TIMEOUT segundos." >&2
exit 1
