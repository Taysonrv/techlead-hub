# Implantação Web do TechLead Hub

## Entrega

A imagem contém o frontend React e o backend Node.js. O backend serve a SPA e a API na mesma origem, eliminando configuração de URL por usuário.

- URL planejada: `https://techlead-hub.aliare.co`
- Porta interna: `3333`
- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- Usuário do container: `techlead`

## Responsabilidades da infraestrutura

1. Disponibilizar PostgreSQL e `DATABASE_URL`.
2. Injetar `JWT_SECRET` e `SYSTEM_CONFIG_KEY` por secret do orquestrador.
3. Publicar a porta 3333 atrás de proxy HTTPS.
4. Manter `SYSTEM_CONFIG_KEY` estável entre versões; sua troca sem migração impede ler configurações criptografadas.
5. Atualizar a tag da imagem somente após validar o health check.

As credenciais Azure, Microsoft 365, SharePoint e BPMN são cadastradas por um administrador na aplicação e persistidas criptografadas no PostgreSQL. Elas não fazem parte da imagem.

## Build

```bash
docker build --build-arg BUILDKIT_INLINE_CACHE=1 -t techlead-hub:1.0.0-rc.1 .
```

## Execução de referência

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml up -d
```

## Atualização e rollback

1. Registrar a tag e o digest atuais.
2. Baixar a nova imagem imutável.
3. Executar as migrações compatíveis com a versão.
4. Substituir o container e aguardar `/health/ready`.
5. Em falha, restaurar a tag/digest anterior. Migrações destrutivas não são permitidas sem plano específico de rollback.

O Desktop e a Web utilizam o mesmo contrato de API e o mesmo PostgreSQL. Na fase de transição, o Desktop pode continuar com backend embarcado; a etapa seguinte permitirá apontá-lo ao backend central por `TECHLEAD_HUB_SERVER_URL`.

## Primeiro inicio com PostgreSQL existente

Na raiz do repositorio, copie `deploy/.env.example` para `deploy/.env` e preencha `DATABASE_URL`, `JWT_SECRET` e `SYSTEM_CONFIG_KEY` com valores reais. Nao publique o arquivo preenchido. O host do PostgreSQL deve ser acessivel pelo container; `localhost` representa o proprio container. Codifique caracteres especiais das credenciais na URL.

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml pull
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml up -d
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.example.yml logs --tail=100 techlead-hub
curl http://localhost:8080/health
curl http://localhost:8080/health/ready
```

O Compose valida variaveis obrigatorias antes de criar o container e publica a porta externa 8080 para a interna 3333. Se alterar `TECHLEAD_HUB_PORT`, ajuste as URLs de verificacao. `MIGRATE_ON_START=true` executa as migracoes na inicializacao; combine essa etapa com o time de banco. Mantenha `SYSTEM_CONFIG_KEY` estavel entre atualizacoes. Para uma nova imagem, atualize `TECHLEAD_HUB_IMAGE` e `APP_VERSION` no arquivo de ambiente apos sua publicacao.
