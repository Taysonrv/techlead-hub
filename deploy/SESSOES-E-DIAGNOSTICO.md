# Sessões, diagnóstico e compatibilidade

## Política de acesso

- Web e Desktop compartilham o banco central e não podem permanecer ativos simultaneamente para o mesmo usuário.
- Um novo login na outra plataforma retorna `409 SESSION_CONFLICT`.
- O usuário pode confirmar a transferência; a sessão anterior é revogada e a ação é auditada.
- O heartbeat ocorre a cada 60 segundos e renova o token e a validade da sessão.
- Sessões sem atividade são revogadas após cinco minutos por padrão.
- Administradores consultam e encerram sessões em **Configurações > Sessões ativas**.

## Variáveis

```env
APP_VERSION=1.0.0-rc.1
APP_RUNTIME=web
MIGRATE_ON_START=true
SESSION_IDLE_TIMEOUT_MS=300000
```

`APP_VERSION` deve ser igual à tag da imagem. O pipeline unificado injeta a mesma versão na imagem Web e no instalador Desktop. Clientes com versão principal incompatível recebem HTTP 426 e devem ser atualizados.

## Inicialização do contêiner

O entrypoint executa `prisma migrate deploy` antes do backend. Se a política da infraestrutura exigir migrations em um job separado, execute-as previamente e configure `MIGRATE_ON_START=false`.

## Verificações

- `GET /health`: processo HTTP, runtime, versão e Node.js.
- `GET /health/ready`: disponibilidade do banco.
- `GET /api/system-settings/diagnostics`: diagnóstico administrativo completo.
- `GET /api/sessions`: sessões ativas, somente administrador.

## Implantação segura

1. Fazer backup do PostgreSQL.
2. Executar a imagem candidata em homologação.
3. Confirmar a migration de `UserSession` e a criação de `AuditLog`.
4. Testar login Web e tentativa simultânea no Desktop.
5. Testar transferência da sessão e expiração após cinco minutos.
6. Validar `/health/ready` antes de liberar o tráfego.
7. Promover a mesma versão para Web e Desktop.

## Foto de perfil

A foto é armazenada no PostgreSQL, e não no filesystem do contêiner. São aceitos JPG, PNG e WebP com até 2 MB. Assim, a foto é compartilhada entre Web e Desktop e permanece disponível após atualizações ou substituições da imagem.

## Atualização da aplicação Web

Cada versão gera uma nova imagem imutável no GHCR. O contêiner em execução não se modifica sozinho: a infraestrutura deve executar o pull da nova tag e recriar o serviço. Esse passo pode ser automatizado por pipeline de implantação, webhook, GitOps ou ferramenta equivalente. Os usuários recebem a versão nova no próximo carregamento do navegador após a troca do contêiner.
