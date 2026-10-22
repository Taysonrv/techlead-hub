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

## Arquitetura de alertas
1. Após persistir um ticket realmente novo, normalizar o assunto (Unicode NFD, remoção de diacríticos e caixa) e verificar os termos configurados: `AGRIQ`, `receituário`, `receita`.
2. Registrar o evento em uma fila persistente, com chave única por ID Movidesk e tipo de evento. Atualizações de ticket existente não geram alerta de novo atendimento.
3. Um worker independente envia o evento por HTTP POST ao webhook do Microsoft Teams Workflows e atualiza o estado da fila.
4. O evento e o ticket devem ser gravados de forma atômica, para não criar ticket novo sem registrar seu alerta.
5. Implementar retentativas com backoff exponencial e jitter, respeitando `Retry-After` quando fornecido. Falhas de envio não devem bloquear a sincronização Movidesk.
6. Como não há transação distribuída entre banco e Teams, usar entrega at-least-once. Se o Teams aceitar o cartão e a confirmação local falhar, uma duplicidade remota ainda é possível; não prometer exactly-once.

## Microsoft Teams Workflows
O destino configurado pelo usuário é um **chat em grupo** por meio do modelo de webhook dos Workflows. O trigger aceita apenas HTTP POST e espera um payload de cartão adaptável (Adaptive Card) ou cartão de mensagem, com limite de 256 KB.

- Enviar `Content-Type: application/json`.
- Usar um Adaptive Card compacto, sem dados desnecessários, com os oito campos requeridos.
- Guardar a URL do webhook em variável de ambiente/secret store; nunca versionar, exibir na interface ou gravar a URL em logs.
- Manter a integração desligada por padrão até a URL ser configurada no ambiente protegido e validada em homologação.
- Validar respostas HTTP e timeout. Sanitizar logs para registrar status, duração e ID do evento, nunca o webhook ou segredos.
- O formato final do JSON deve corresponder ao trigger/modelo escolhido no Workflow; confirmar se ele espera um objeto Adaptive Card direto ou um envelope específico antes do teste integrado.

### Payload de referência (Adaptive Card)
O envelope exato deve ser ajustado ao trigger selecionado no Workflow. Este é o objeto de cartão a ser transportado dentro do envelope aceito por ele:

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    { "type": "TextBlock", "text": "Novo atendimento Movidesk", "weight": "Bolder", "size": "Medium", "wrap": true },
    { "type": "FactSet", "facts": [
      { "title": "Número", "value": "123456" },
      { "title": "Assunto", "value": "AGRIQ — exemplo" },
      { "title": "Cliente", "value": "Cliente exemplo" },
      { "title": "Abertura", "value": "22/10/2026 10:30" },
      { "title": "Prioridade", "value": "Alta" },
      { "title": "Status", "value": "Novo" },
      { "title": "Responsável", "value": "Equipe responsável" }
    ] },
    { "type": "ActionSet", "actions": [
      { "type": "Action.OpenUrl", "title": "Abrir atendimento", "url": "https://example.invalid/tickets/123456" }
    ] }
  ]
}
```

O cartão acima é ilustrativo: valores e URL devem vir do registro real, e a URL-base deve ser configurada/validada. Não usar o domínio de exemplo em produção.

## Configuração proposta
- `TEAMS_ALERTS_ENABLED=false` por padrão.
- `TEAMS_WORKFLOW_WEBHOOK_URL` armazenada apenas em configuração protegida.
- `TEAMS_TICKET_BASE_URL` para montar o link direto do atendimento.
- `TEAMS_ALERT_TERMS=AGRIQ;receituário;receita`.
- Timeout HTTP configurável e limitado; tamanho serializado validado antes do envio (máximo 256 KB).

## Testes obrigatórios
- Matching: AGRIQ em diferentes caixas; receituário com/sem acento; receita; texto vazio e falsos positivos.
- Deduplicação: reimportar o mesmo ticket gera um único evento; ticket existente atualizado não dispara alerta de novo.
- Atomicidade: falha ao persistir evento não deve deixar ticket novo sem sinalização silenciosa.
- Worker: sucesso, timeout, HTTP 429/Retry-After, HTTP 5xx, reinício com pendências e duas instâncias concorrentes.
- Segurança: logs sem URL/segredos, conteúdo escapado, URL de destino validada e payload abaixo de 256 KB.
- Contrato: validar o envelope esperado pelo trigger real do Workflow e publicar em chat de homologação.
- Regressão: escopo SIMER e baseline manual permanecem inalterados; testes atuais passam.

## Critérios de aceite
- Medir latência de sincronização e de alerta.
- Falhas de envio permanecem persistidas e são retentadas sem bloquear a sincronização principal.
- Métricas de idade da fila, tentativas, entregues, falhas e HTTP 429.
- Nenhuma migração ou ativação em produção sem revisão, backup/plano de rollback e autorização explícita.
