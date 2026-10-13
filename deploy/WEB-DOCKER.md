# TechLead Hub Web — implantação Docker

Há dois cenários suportados. **Escolha apenas um Compose**, conforme a infraestrutura.

## A. Banco PostgreSQL externo (equipe de banco de dados)

Este é o cenário indicado quando a equipe já administra o PostgreSQL. **Não use o `docker-compose.yml` da raiz**, pois ele provisiona um PostgreSQL separado.

Pré-requisitos: Docker Compose v2, acesso à imagem no GHCR, host PostgreSQL acessível a partir do contêiner, banco e usuário provisionados e credenciais fornecidas pela equipe de BD.

Na raiz do repositório:

```bash
cp deploy/.env.example deploy/.env
# Edite deploy/.env: TECHLEAD_HUB_IMAGE, DATABASE_URL, JWT_SECRET,
# SYSTEM_CONFIG_KEY, CORS_ALLOWED_ORIGINS e PASSWORD_RESET_URL.
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml pull
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml up -d
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml logs --tail=100 techlead-hub
```

O `config --quiet` verifica variáveis obrigatórias antes de criar contêineres. **Não execute `docker compose config` sem `--quiet` em canais compartilhados**, pois ele pode exibir segredos resolvidos. `deploy/.env` é lido pela CLI via `--env-file`; apenas as variáveis declaradas em `environment` são repassadas ao contêiner.

Modelo para `DATABASE_URL`: `postgresql://USUARIO:SENHA@HOST_DB:5432/BANCO?schema=public`. Use nome DNS/IP acessível do contêiner (não `localhost` para banco externo). Codifique caracteres reservados no usuário e senha em formato percent-encoding, por exemplo `@` → `%40`. Não inclua credenciais em logs, prints ou chamados.

Por padrão `MIGRATE_ON_START=false`. A equipe de BD deve planejar e aprovar o procedimento de migração antes da primeira implantação ou atualização que exija mudanças de schema. Não habilite migração automática sem autorização.

## B. Banco PostgreSQL em contêiner Docker

Somente para implantações que realmente desejam criar um PostgreSQL local gerenciado pelo Compose: utilize o `docker-compose.yml` da raiz e seu `.env.web.example`, se disponível. Esse Compose possui serviços `postgres`, `migrate` e `app`, e requer `POSTGRES_PASSWORD` e `JWT_SECRET`. Não misture suas variáveis/serviços com o cenário A.

## Validação e diagnóstico

- Aplicação: `http://SERVIDOR:8080` (ou porta configurada).
- Liveness: `GET /health/live`
- Readiness (inclui dependências): `GET /health/ready`

Para cenário A:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml logs --tail=200 techlead-hub
curl -fsS http://127.0.0.1:8080/health/live
curl -fsS http://127.0.0.1:8080/health/ready
```

Se aparecer `Variável obrigatória ausente: DATABASE_URL`, o container **não recebeu a variável**, independentemente do `.env` existir. Valide a localização do arquivo e use o comando Compose completo acima. Se houver falha de conexão após a variável ser entregue, confira DNS, porta, firewall, usuário, senha, SSL e permissões do banco.

O aviso de `version is obsolete` é gerado por um atributo obsoleto no Compose usado pela equipe, não pela imagem. Remova a linha `version:` daquele arquivo.

## Atualização

Atualize a tag de `TECHLEAD_HUB_IMAGE` em `deploy/.env` somente depois de validar a imagem publicada, realizar backup e aprovar eventuais migrações. Execute os comandos `pull`, `up -d`, `ps` e `logs` acima.

## Segurança

- Nunca versione `deploy/.env`; proteja o acesso ao arquivo e ao host Docker.
- Mantenha `JWT_SECRET` e `SYSTEM_CONFIG_KEY` longos, seguros e estáveis em atualizações.
- Use HTTPS com proxy reverso, ajuste `TRUST_PROXY` à topologia e não exponha o PostgreSQL.
- O contêiner opera com usuário não-root; o Compose reduz capabilities.
- Em falhas, encaminhe apenas logs sem credenciais à equipe técnica.
