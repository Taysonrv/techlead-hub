# API da RC.6

Todas as rotas abaixo utilizam a autenticação padrão da aplicação. Operações de importação e sincronização exigem perfil Administrador ou Coordenador.

## Importação Movidesk

- `POST /api/import/tickets/preview`: valida `.xlsx` ou `.json`, conta registros, calcula SHA-256 e informa se o arquivo já foi processado.
- `POST /api/import/tickets`: confirma a importação previamente validada e registra a auditoria da execução.

## Central de Sincronizações

- `GET /api/sync-center/summary`: situação consolidada das integrações.
- `GET /api/sync-center/history`: histórico paginado e filtrável do Movidesk e Azure DevOps.
- `GET /api/sync-center/movidesk/:runId/errors`: ocorrências persistidas de uma importação.
- `POST /api/movidesk/sync`: sincronização manual autenticada pela API do Movidesk.
- `POST /api/azure-devops/sync/incremental`: sincronização incremental do Azure DevOps.
- `POST /api/azure-devops/sync/full`: sincronização completa do Azure DevOps.

Os arquivos aceitos possuem limite de 50 MB. Payloads JSON são limitados a 10 mil tickets por lote.
