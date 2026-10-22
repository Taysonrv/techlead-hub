# Movidesk: sincronização incremental e alertas no chat do Teams

## Objetivo
Diminuir a latência percebida de novos atendimentos e enviar um alerta ao chat em grupo do Microsoft Teams quando o assunto corresponder a AGRIQ, receituário ou receita.

## Diagnóstico do código atual
- `MovideskSyncPolicy.ts`: intervalo padrão de 5 minutos, mínimo configurável de 2 minutos e janela de segurança de 360 minutos.
- `MovideskRateLimiter.ts`: intervalo mínimo de 6.200 ms por chamada (aprox. 9,7 chamadas/minuto), respeitando `Retry-After`.
- `MovideskService.remoteScopeFilter()`: início em 2026-01-01 e filtro de clientes limitado a `SIMER_CLIENTS`.
- `MovideskSyncScheduler`: aguarda baseline FULL manual concluído e não mantém transação aberta durante chamadas externas.
- `MovideskJsonImportService.execute()`: faz upsert por `movideskId` e sabe se o registro já existia antes da gravação.

O filtro de clientes é parte do escopo operacional e não deve ser ampliado sem validar o ticket ausente. Diminuir a cadência, isoladamente, não corrige ticket excluído pelo filtro nem consultas aguardando o rate limiter.

## Diagnóstico de ticket ausente
1. Confirmar o ID do atendimento.
2. Consultar esse ID diretamente na API Movidesk, sem gravar dados.
3. Registrar somente metadados não secretos: status HTTP, ID, `createdDate`, cliente/organização, `lastUpdate`, correspondência com `SIMER_CLIENTS` e duração.
4. Comparar o ticket com o filtro remoto completo atual. Não remover filtros nem executar FULL.
5. Se a API o retorna no escopo atual, rastrear paginação/cursor e resultado do importador.
6. Se o banco local contém o ticket, validar o filtro do endpoint/dashboard.
7. Documentar a causa comprovada antes de propor mudança no escopo.

O ticket 815483 apareceu em diagnóstico anterior como caso suspeito, mas não há evidência neste repositório que confirme ser o atendimento atual ou explique sua ausência.

## Arquitetura proposta
1. Após upsert bem-sucedido de ticket novo, normalizar o assunto (Unicode NFD, diacríticos e caixa) e verificar os termos configurados.
2. Inserir evento em fila persistente na mesma transação lógica da gravação, com chave única `movideskId + tipo de evento`. Atualizações não geram alerta de novo atendimento.
3. Worker independente lê pendências com lock concorrente seguro, envia via Microsoft Graph e registra tentativa, próximo horário, status e erro sanitizado.
4. Backoff exponencial com jitter; respeitar `Retry-After` para HTTP 429; manter fila após reinício.
5. Como PostgreSQL e Teams não compartilham transação, usar semântica at-least-once e idempotência local. Se o Teams aceitar a mensagem e a persistência de sucesso falhar, pode haver duplicidade remota; não prometer exactly-once.
6. Mensagem: número, assunto, cliente, data de abertura, prioridade, link direto, status e responsável. Escapar conteúdo e gerar link a partir de URL base configurada.

## Integração Teams
Destino: **chat em grupo**, não canal. Incoming Webhook/Workflow de canal não é substituto para envio a chat. A integração recomendada é Microsoft Graph `POST /chats/{chat-id}/messages`, com identidade de aplicação e permissões administrativas aprovadas.

Configuração provisória:
- `TEAMS_ALERTS_ENABLED=false` por padrão;
- `TEAMS_TENANT_ID`, `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET` em armazenamento de segredos/variáveis protegidas;
- `TEAMS_GROUP_CHAT_ID`;
- `TEAMS_TICKET_BASE_URL`;
- `TEAMS_ALERT_TERMS=AGRIQ;receituário;receita`.

A ativação deve permanecer desligada até configuração do tenant/chat e validação de permissões.

## Testes obrigatórios
- Matching: AGRIQ em diferentes caixas; receituário com/sem acento; receita; texto vazio e falsos positivos.
- Deduplicação: reimportar o mesmo ticket gera um único evento; ticket existente atualizado não dispara alerta de novo.
- Atomicidade: falha ao persistir evento não deve deixar ticket novo sem sinalização silenciosa.
- Worker: sucesso, timeout, HTTP 429/Retry-After, HTTP 5xx, token expirado, reinício com pendências e duas instâncias concorrentes.
- Segurança: logs sem segredos, conteúdo escapado e URL validada.
- Regressão: escopo SIMER e baseline manual permanecem inalterados; testes atuais passam.
- Integração Graph com chat de homologação antes da ativação de produção.

## Critérios de aceite
- Medir latência de sync e de alerta.
- Falhas de envio permanecem persistidas e são retentadas sem bloquear a sincronização principal.
- Métricas de idade da fila, tentativas, entregues, falhas e HTTP 429.
- Nenhuma migração ou ativação em produção sem revisão, backup/plano de rollback e autorização explícita.
