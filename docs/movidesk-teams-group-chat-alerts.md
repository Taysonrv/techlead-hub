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
1. Após persistir um ticket realmente novo, normalizar o assunto (Unicode NFD, remoção de diacríticos e caixa) e verificar os termos configurados: `AGRIQ`, `receituário`, `receita avulsa` ou `receita agronômica`. O termo legado genérico `receita` é tratado como essas duas famílias, nunca como correspondência isolada.
2. Registrar o evento em uma fila persistente, com chave única por ID Movidesk e tipo de evento. Atualizações de ticket existente não geram alerta de novo atendimento.
3. Um worker independente envia o evento por HTTP POST ao webhook do Microsoft Teams Workflows e atualiza o estado da fila.
4. O evento e o ticket devem ser gravados de forma atômica, para não criar ticket novo sem registrar seu alerta.
5. Implementar retentativas com backoff exponencial e jitter, respeitando `Retry-After` quando fornecido. Falhas de envio não devem bloquear a sincronização Movidesk.
6. Como não há transação distribuída entre banco e Teams, usar entrega at-least-once. Se o Teams aceitar o cartão e a confirmação local falhar, uma duplicidade remota ainda é possível; não prometer exactly-once.

## Microsoft Teams Workflows
O destino é um **chat em grupo**, por meio do modelo de webhook dos Workflows. A documentação oficial da Microsoft confirma que o endpoint criado pelo modelo recebe HTTP POST e aceita Adaptive Card ou Message Card. A orientação de teste é enviar o JSON do cartão no corpo da requisição e visualizar o cartão publicado no Teams. Consulte: https://support.microsoft.com/en-us/workflows/send-messages-in-teams-using-incoming-webhooks

- Enviar `POST` com `Content-Type: application/json`.
- Enviar o objeto JSON do Adaptive Card diretamente no corpo da requisição, conforme a orientação da documentação Microsoft; não adicionar um envelope arbitrário `{ "card": ... }`.
- A autenticação permitida depende do modelo de Workflow selecionado. Respeitar a configuração gerada pelo Teams.
- Usar um Adaptive Card compacto, com os oito campos necessários e abaixo do limite de 256 KB.
- Guardar a URL do webhook em variável de ambiente/secret store; nunca versionar, exibir na interface ou gravar a URL em logs.
- Manter a integração desligada por padrão até a URL ser configurada no ambiente protegido e validada em homologação.
- Validar respostas HTTP e timeout. Sanitizar logs para registrar status, duração e ID do evento, nunca o webhook ou segredos.

### Payload de referência (Adaptive Card)
Este JSON de cartão ilustrativo é o corpo do POST. Substituir os valores de exemplo pelos campos do atendimento real e gerar o link a partir de uma URL-base validada.

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "Novo atendimento Movidesk",
      "weight": "Bolder",
      "size": "Medium",
      "wrap": true
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Número", "value": "123456" },
        { "title": "Assunto", "value": "AGRIQ — exemplo" },
        { "title": "Cliente", "value": "Cliente exemplo" },
        { "title": "Abertura", "value": "22/10/2026 10:30" },
        { "title": "Prioridade", "value": "Alta" },
        { "title": "Status", "value": "Novo" },
        { "title": "Responsável", "value": "Equipe responsável" }
      ]
    },
    {
      "type": "ActionSet",
      "actions": [
        {
          "type": "Action.OpenUrl",
          "title": "Abrir atendimento",
          "url": "https://example.invalid/tickets/123456"
        }
      ]
    }
  ]
}
```

O cartão acima é ilustrativo. Não usar o domínio `example.invalid` em produção. Validar a URL final e o comportamento do Workflow em chat de homologação antes da ativação.

## Configuração
- `TEAMS_ALERTS_ENABLED=false` por padrão.
- `TEAMS_WORKFLOW_WEBHOOK_URL` armazenada apenas em configuração protegida.
- `TEAMS_TICKET_BASE_URL` para montar o link direto do atendimento.
- `TEAMS_ALERT_TERMS=AGRIQ;receituário;receita avulsa;receita agronômica`.
- Se a configuração existente ainda contiver `receita`, o matcher restringe esse termo a `receita avulsa`/`receita agronômica`; títulos fiscais como `Código de receita Impostos` não geram alerta.
- Timeout HTTP configurável e limitado; tamanho serializado validado antes do envio (máximo 256 KB).

## Cobertura e homologação
- Matching: AGRIQ em diferentes caixas; receituário com/sem acento; receita avulsa e agronômica; texto vazio; rejeitar `Código de receita Impostos` e outros falsos positivos fiscais.
- Deduplicação: reimportar o mesmo ticket gera um único evento; ticket existente atualizado não dispara alerta de novo.
- Atomicidade: falha ao persistir evento não deve deixar ticket novo sem sinalização silenciosa.
- Worker: sucesso, timeout, HTTP 429/Retry-After, HTTP 5xx, reinício com pendências e duas instâncias concorrentes.
- Segurança: logs sem URL/segredos, conteúdo escapado, URL de destino validada e payload abaixo de 256 KB.
- Contrato: POST com o Adaptive Card diretamente no body, usando o modelo e autenticação configurados no Workflow; publicar em chat de homologação.
- Regressão: escopo SIMER e baseline manual permanecem inalterados; testes atuais passam.

## Critérios operacionais
- Medir latência de sincronização e de alerta.
- Falhas de envio permanecem persistidas e são retentadas sem bloquear a sincronização principal.
- O worker registra duração e resultado HTTP no sucesso; registrar idade da fila, volume pendente, tentativas, itens `DEAD` e respostas HTTP 429 continua sendo requisito de observabilidade.
- Nenhuma migração ou ativação em produção sem revisão, backup/plano de rollback e autorização explícita.


## Implementação inicial da fila persistente

- Com `TEAMS_ALERTS_ENABLED=true`, o importador grava o ticket e o evento de alerta na mesma transação. Só a primeira inserção de um ID Movidesk cria o evento; atualizações posteriores não geram novo alerta. Com a flag ausente ou diferente de `true`, o importador não acessa a tabela de outbox, permitindo manter o recurso desativado antes da migração.
- A tabela `TeamsAlertOutbox` usa chave única por `movideskId + eventType`, estados `PENDING`, `PROCESSING`, `SENT` e `DEAD`, bloqueio temporário para concorrência e retentativas com backoff exponencial e jitter.
- O worker processa um evento por ciclo, separado do scheduler de sincronização. A falha no Teams não interrompe a importação do Movidesk.
- A configuração está desligada por padrão (`TEAMS_ALERTS_ENABLED=false`). O modelo de variáveis de ambiente está em `backend/.env.teams.example`; copie somente as variáveis necessárias para o `.env` local ignorado pelo Git.
- Não ativar até confirmar a URL-base real do ticket no Movidesk e testar o formato do Adaptive Card com um chat de homologação.
- A migration `20261022120000_movidesk_teams_alert_outbox` faz parte do código e é aplicada pelo fluxo normal de migration de deploy. A flag permanece desligada por padrão; só habilitar em ambiente com migration aplicada, webhook HTTPS e URL-base verificadas e envio validado em chat de homologação.
- O CI do repositório executa a suíte de backend, builds e validações de integração. Antes da primeira ativação em cada ambiente, validar especificamente envio, timeout, retry/Retry-After, recuperação após reinício e concorrência de duas instâncias.
- Nunca incluir URL do webhook em documentação, logs, tickets ou pacote do frontend.

## Processos adicionais independentes

Os avisos existentes de AgriQ continuam usando `TEAMS_ALERTS_ENABLED`, `TEAMS_WORKFLOW_WEBHOOK_URL` e `TEAMS_ALERT_TERMS`. Os processos abaixo usam uma fila persistente separada, URLs próprias e controles independentes na tela Configurações; as URLs são criptografadas na tabela `SystemSetting` e nunca retornadas ao frontend.

- Ticket: somente primeira inserção no Hub, status Movidesk Novo e carteira operacional `ticketOperationalScope()` (cliente SIMER, serviço SIMER, responsável da carteira e data dentro do escopo); não usa `TEAMS_ALERT_TERMS`.
- Task criada: Work Item criado por Tayson Alves de Araujo, Renan Breno Carvalho ou Alan Kardek, com número Movidesk vinculado.
- Task retornando a Registro: mudança de estado observada para Registro, para os mesmos criadores e com ticket vinculado. Cada revisão Azure gera chave idempotente própria; reentradas posteriores podem notificar novamente.
- A fila retém o snapshot do evento, processa tentativas com backoff, evita duplicidade por chave do evento e não processa eventos enquanto o respectivo fluxo estiver desligado.
- As variáveis `TEAMS_SUPPORT_NEW_TICKETS_*`, `TEAMS_AZURE_TASK_CREATED_*` e `TEAMS_AZURE_TASK_REGISTRO_*` ficam desligadas por padrão. Elas podem fornecer valores iniciais; as configurações administrativas persistidas têm precedência. O backend precisa de `TEAMS_TICKET_BASE_URL` HTTPS para construir links de ticket.
- O retorno a Registro é baseado nas transições observadas pelo sincronizador incremental do Azure; uma saída e retorno ocorridos inteiramente entre sincronizações podem não ser detectados sem Azure Service Hooks ou consulta do histórico de revisões.
