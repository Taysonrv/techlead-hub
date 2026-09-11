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
