# TechLead Hub Web — implantação Docker

## Pré-requisitos
- Docker Engine com Docker Compose v2.
- Acesso ao registry `ghcr.io/taysonrv/techlead-hub`.
- DNS e HTTPS/reverse proxy quando o acesso não for restrito à rede interna.

## Primeira implantação
1. Copie `.env.web.example` para `.env`.
2. Defina obrigatoriamente `POSTGRES_PASSWORD` e `JWT_SECRET`.
3. Ajuste `TECHLEAD_IMAGE`, `TECHLEAD_PORT` e `CORS_ALLOWED_ORIGINS` conforme o ambiente.
4. Execute:
   ```bash
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

O serviço `migrate` executa `prisma migrate deploy` uma única vez antes da aplicação. A aplicação não executa migrations por padrão.

## Validação
- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`
- Interface: `http://SERVIDOR:TECHLEAD_PORT`

## Atualização
```bash
docker compose pull
docker compose up -d
docker compose ps
```

## Persistência e backup
O PostgreSQL usa o volume nomeado `techlead_postgres_data`. Inclua esse volume na política de backup do ambiente. Antes de upgrades relevantes, gere backup lógico do banco.

## Reverse proxy
Em produção, publique o TechLead Hub atrás de HTTPS. O proxy deve encaminhar `X-Forwarded-Proto`, `X-Forwarded-For` e `Host`. Ajuste `TRUST_PROXY` de acordo com a topologia real. Não exponha a porta do PostgreSQL.

## Segurança
- Não versione o arquivo `.env`.
- Use segredo JWT longo e exclusivo.
- Restrinja o acesso ao registry e ao host Docker.
- Mantenha HTTPS para acesso externo à máquina.
- A imagem executa com usuário não-root e capabilities removidas pelo Compose.

## Diagnóstico
```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 migrate
docker compose logs --tail=200 postgres
```

A tela Configurações > Diagnóstico da plataforma também apresenta versão, runtime, banco e latência para administradores.
