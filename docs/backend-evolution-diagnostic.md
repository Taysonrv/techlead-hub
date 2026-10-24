# TechLead Hub — diagnóstico inicial para evolução do backend

> Estado: levantamento preliminar de Fase 0; **nenhuma alteração estrutural do backend autorizada ou aplicada**. Atualizar após inventário completo de rotas e medições.

## Escopo e compatibilidade

- Stack observada em `backend/package.json`: Express 5, Prisma 6, TypeScript 5.9, CommonJS, tsx, axios, jsonwebtoken, bcryptjs, multer, exceljs, cors e dotenv.
- Persistência: PostgreSQL (`backend/prisma/schema.prisma`); **não** SQLite.
- `backend/tsconfig.json` já habilita `strict` e `noUncheckedIndexedAccess`.
- Preservar rotas, payloads, status HTTP, autenticação, dados e migrações; não alterar schema sem aprovação e plano de migração.
- O contexto fornecido menciona Teams como legado, mas `backend/src/server.ts` ainda inicializa `MovideskTeamsAlertScheduler`. Confirmar intenção de produto antes de qualquer remoção.

## Inventário de montagem das rotas (parcial)

A raiz `backend/src/routes/index.ts` monta `/api/auth` como área pública com proteção individual nas rotas autenticadas. A partir de `routes.use("/api", authMiddleware)`, as demais rotas registradas passam por autenticação global.

| Base | Módulo | Autenticação |
| --- | --- | --- |
| `/health`, `/health/ready`, `/health/live` | Saúde e prontidão | Pública |
| `/api/auth` | Login, cadastro, setup, senha, sessão, avatar | Por endpoint; login/cadastro públicos com rate limit |
| `/api/dashboard` | Indicadores, categorias, classificações, atenção, clientes, tendências e tickets | JWT + `requireAnyPermission` |
| `/api/users` | Administração de usuários | JWT; permissões internas a verificar |
| `/api/global`, `/api/knowledge`, `/api/system-settings`, `/api/sessions`, `/api/chat` | Dados gerais, conhecimento, configuração, sessões, chat | JWT; permissões internas a verificar |
| `/api/coordination`, `/api/simer-map`, `/api/known-problems`, `/api/intelligence` | Operação, mapa e inteligência | JWT; permissões internas a verificar |
| `/api/azure-devops`, `/api/azure-sync`, `/api/sync-center`, `/api/azure-work-items` | Azure e sincronizações | JWT; permissões internas a verificar |
| `/api/movidesk`, `/api/reports`, `/api/notifications`, `/api/workspace` | Movidesk, relatórios e workspace | JWT; permissões internas a verificar |
| `/api/import/tickets/preview`, `/api/import/tickets` | Importação | JWT + permissão `imports`; multer 50 MB |

**Pendente:** mapa exaustivo de método, caminho, validação, papel e consumidor frontend por rota. Esta tabela descreve bases e alguns endpoints confirmados, não substitui o inventário completo.

## Achados e prioridades preliminares

1. **Alto — limite HTTP global**: `backend/src/app.ts` configura `express.json` e `express.urlencoded` em 200 MB, justificado por publicação Bizagi. Avaliar limites menores por padrão e exceção específica sem quebrar o fluxo atual.
2. **Alto — política CORS**: `app.ts` permite origens localhost/127.0.0.1 de forma ampla, além de `CORS_ALLOWED_ORIGINS`. Avaliar origens Web, Electron e threat model antes de restringir.
3. **Médio — upload de planilhas**: `import.routes.ts` limita o arquivo a 50 MB em memória e exige permissão `imports`. Verificar MIME, extensão, conteúdo, número de linhas, complexidade e mensagens de erro no controller.
4. **Médio — contratos de erro**: respostas observadas incluem `{ message }` e `{ error: string, retryAfterSeconds }`. Não trocar imediatamente por `{ error: { code, message } }` sem adaptador compatível.
5. **Médio — limites de memória do rate limiter**: `app.ts` mantém buckets em `Map` por processo e limpa periodicamente após ultrapassar 5 mil entradas. Avaliar comportamento em múltiplas instâncias e sob tráfego elevado.
6. **Médio — divergência de escopo Teams**: agendador ativo no servidor; confirmar se é legado, dependência funcional ou funcionalidade a desativar.
7. **Positivo — proteções existentes**: cabeçalhos de segurança e CSP, rate limit, middleware de autenticação, sessões revogáveis no banco, health/readiness, CI com teste de desktop e auditoria crítica. Evoluir sem duplicar esses mecanismos.

## Sequência proposta (sujeita à aprovação)

1. Completar inventário de rotas, middleware, integrações, consultas Prisma, uso no frontend e testes; registrar linha de base CI e, quando possível, local.
2. Segurança incremental e compatível: limites de body por rota, CORS testado em Web/Electron, uploads, validação e cobertura de permissões.
3. Padronizar observabilidade e erros com adaptador compatível; medir endpoints antes de otimizar.
4. Avaliar sincronizações, idempotência, índices, N+1 e cache com métricas reais.
5. Ampliar testes, documentação, OpenAPI e runbooks; homologar desktop.

## Linha de base e validação

- CI da branch executa `npm run prisma:generate`, valida Prisma, build e testes backend, lint/testes/build frontend, testes/build desktop e build Docker. O sucesso do CI não equivale a homologação visual/interativa Electron.
- **Não executado localmente neste diagnóstico:** benchmark p50/p95, teste contra banco real, auditoria exaustiva de rotas, instalação do Electron e rollback de migrações.
- **Sem migrations, novas dependências, alterações de API ou variáveis de ambiente nesta etapa.**

## Fase 1 — primeira entrega incremental

- `backend/src/app.ts`: requisições JSON/urlencoded acima do limite configurado passam a retornar HTTP 413 com o formato legado `{ error: string }`; logs de erros globais não registram mais o objeto de erro integral.
- `backend/src/routes/import.routes.ts`: o limite de upload Movidesk permanece 50 MB, mas excedê-lo retorna HTTP 413; demais erros de multipart retornam HTTP 400, sem detalhes internos. A autenticação e a permissão `imports` permanecem.
- Sem dependências, migrations, alteração de payloads de sucesso ou mudança dos limites efetivos.
- **Ainda pendente:** testes de integração das respostas 413/400, revisão de MIME/assinatura dos arquivos, limites por rota, CORS e validação de permissões. Confirmar CI antes de avançar.
