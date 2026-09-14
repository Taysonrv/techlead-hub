# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS frontend-build
ARG APP_VERSION=development
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-build
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run prisma:generate && npm run build

FROM node:22-bookworm-slim AS runtime
ARG APP_VERSION=development
ENV NODE_ENV=production \
    APP_RUNTIME=web \
    APP_VERSION=$APP_VERSION \
    MIGRATE_ON_START=true \
    HOST=0.0.0.0 \
    PORT=3333
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system techlead \
    && useradd --system --gid techlead --home-dir /app techlead
COPY --from=backend-build --chown=techlead:techlead /build/backend/dist ./backend/dist
COPY --from=backend-build --chown=techlead:techlead /build/backend/node_modules ./backend/node_modules
COPY --from=backend-build --chown=techlead:techlead /build/backend/package.json ./backend/package.json
COPY --from=backend-build --chown=techlead:techlead /build/backend/prisma ./backend/prisma
COPY --from=frontend-build --chown=techlead:techlead /build/frontend/dist ./frontend/dist
COPY --chown=techlead:techlead deploy/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 ./docker-entrypoint.sh
USER techlead
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
