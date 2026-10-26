# Homologação do Chat War Room — pacote de integração

## Pré-requisitos

1. Atualizar a branch `feat/chat-war-room` sem mesclar na `main`.
2. Fazer backup do banco e executar `cd backend && npm run prisma:migrate:deploy && npm run prisma:generate`.
3. Executar `npm run test && npm run build` no backend e `npm run lint && npm run test && npm run build` no frontend.
4. Reiniciar todas as instâncias do backend após a migração; versões antigas não escrevem no diário de eventos.

## Contexto Movidesk/Azure

- Criar uma sala CONTEXT vinculada a um ticket Movidesk sincronizado e verificar assunto, situação, cliente, responsável, urgência, indicadores de SLA e tarefa Azure vinculada.
- Criar uma sala CONTEXT vinculada a uma tarefa Azure sincronizada e verificar título, estado, responsável, criticidade, prazo e ticket Movidesk vinculado.
- Confirmar o comportamento quando o registro ainda não foi importado: ausência explícita, sem inventar dados.
- Confirmar que um usuário fora da sala recebe HTTP 404 em `GET /api/chat/channels/:id/context`.
- A consulta usa **dados já sincronizados** no PostgreSQL; não faz chamada externa direta às APIs do Movidesk/Azure. A atualização depende dos jobs de sincronização existentes.

## Duas contas e isolamento

Usar duas contas de teste aprovadas com tokens próprios e canais privados **exclusivos**. Nunca usar tokens de produção em logs.

Configurar:
- `CHAT_INTEGRATION_URL` com URL base incluindo `/api/`;
- `CHAT_INTEGRATION_TOKEN_A`, `CHAT_INTEGRATION_TOKEN_B`;
- `CHAT_INTEGRATION_CHANNEL_A`, `CHAT_INTEGRATION_CHANNEL_B`.

Executar `npm run test` no backend. A suíte `chatTwoUser.integration.test.ts` é ignorada quando as variáveis não estiverem configuradas. Verificar que ambas as contas acessam seus próprios canais, mas não os da outra, e que o diário de eventos não revela IDs de canais exclusivos de terceiros.

## Recuperação de eventos / múltiplas instâncias

- Confirmar a migração `ChatDeliveryEvent` aplicada em todas as instâncias.
- Conectar o usuário A por SSE na instância 1 e enviar mensagem ao mesmo canal pela instância 2.
- A instância 1 deve consultar o diário persistente em até ~5 segundos, mesmo que o evento em memória tenha sido publicado na instância 2.
- Derrubar a conexão SSE, enviar mensagens e reconectar com `Last-Event-ID`. Confirmar avanço do cursor e atualização da lista.
- O diário armazena **apenas** usuário, canal, cursor e horário; nunca conteúdo das mensagens. O snapshot continua autorizado por participação nos canais.
- Rodar periodicamente `npm run chat:events:prune` no backend (retenção padrão: sete dias). A limpeza ainda requer agendamento operacional; não há cron automático.
- Eventos mais antigos que a retenção não são reexecutados individualmente: o frontend reconcilia estado pelo snapshot e pelos endpoints de mensagens/canais.
- Não há garantia de entrega instantânea: polling entre instâncias é de cinco segundos e o frontend também mantém sincronização periódica.

## Critérios de aceite

- [ ] Lint, build e testes do frontend sem erros
- [ ] Build e testes do backend sem erros
- [ ] Migração aplicada e backup validado
- [ ] Contexto real de Movidesk e Azure conferido
- [ ] Isolamento entre duas contas aprovado
- [ ] SSE entre duas instâncias aprovado
- [ ] Reconexão após desconexão aprovada
- [ ] Retenção agendada e monitorada
- [ ] Testes manuais de anexos, histórico, mobile e permissões concluídos

**Status:** implementado na branch de trabalho; ainda não homologado para produção.
