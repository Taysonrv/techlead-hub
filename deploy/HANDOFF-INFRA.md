# Handoff para implantação — TechLead Hub Web 1.0.0-rc.1

## Imagem

```text
ghcr.io/taysonrv/techlead-hub:1.0.0-rc.1
```

Após a publicação, registrar e preferir o digest `sha256` informado pelo GitHub Actions.

## Rede

- Porta interna: `3333`
- URL desejada: `https://techlead-hub.aliare.co`
- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- TLS deve terminar no ingress/reverse proxy corporativo.

## Secrets obrigatórios

- `DATABASE_URL`: PostgreSQL compartilhado.
- `JWT_SECRET`: mínimo de 32 caracteres, estável entre atualizações.
- `SYSTEM_CONFIG_KEY`: mínimo de 32 caracteres, diferente do JWT e estável entre atualizações.

Não incluir secrets na imagem, compose versionado ou chamado de atendimento.

## Variáveis recomendadas

```env
APP_VERSION=1.0.0-rc.1
APP_RUNTIME=web
HOST=0.0.0.0
PORT=3333
TRUST_PROXY=loopback
CORS_ALLOWED_ORIGINS=https://techlead-hub.aliare.co
PASSWORD_RESET_URL=https://techlead-hub.aliare.co/login
AZURE_SYNC_SCHEDULER_ENABLED=true
```

Azure DevOps, Wiki, Microsoft 365, SharePoint e BPMN serão cadastrados por um administrador na tela Configurações e armazenados criptografados no PostgreSQL.

## Implantação de referência

```bash
docker login ghcr.io
docker pull ghcr.io/taysonrv/techlead-hub:1.0.0-rc.1
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml up -d
docker inspect --format='{{json .State.Health}}' techlead-hub
```

## Critérios de aceite antes do Desktop

1. `/health` retorna HTTP 200 e a versão `1.0.0-rc.1`.
2. `/health/ready` retorna HTTP 200.
3. Login e consulta do Dashboard funcionam por HTTPS.
4. Administrador consegue abrir Configurações.
5. Uma reinicialização do container preserva usuários, dados e configurações.
6. Logs não exibem tokens, senhas ou `DATABASE_URL`.

Somente depois desses critérios deve ser publicada a atualização Desktop `1.0.0-rc.1`.
