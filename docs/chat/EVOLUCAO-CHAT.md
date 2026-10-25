# Hub de Conversas — evolução para sala de incidentes SIMER

## Estado em 25/10/2026

A implementação foi iniciada na branch `feat/chat-war-room`, derivada de `feat/auditoria-visual-estabilidade-rc9`. Este documento registra **somente funcionalidades efetivamente implementadas**, não a conclusão de toda a missão.

### Entregue — primeira etapa funcional

1. **Mensagens tipadas e idempotência:** `ChatMessage.kind`, `payload` e `clientMessageId` adicionados de forma aditiva no Prisma e em migração SQL. Mensagens legadas permanecem intactas e são tratadas como `TEXT`. A API aceita `TEXT` e `RECORD_CARD`; `SYSTEM` é reservado ao backend.
2. **Salas contextuais:** `POST /chat/context` para `TICKET` (Movidesk) e `TASK` (Azure). Validação de existência na base local, criação com trava transacional para evitar duplicidade, primeira mensagem de sistema e auditoria. Salas existentes só podem ser reabertas por membros. **Por segurança, não há inclusão automática de terceiros até existir autorização de acesso por registro.**
3. **Acesso pelo ticket:** ação **Abrir sala** no detalhe do ticket, que direciona ao chat e abre ou recupera a sala.
4. **Identificação visual:** cabeçalho mostra a origem e botão para abrir o registro relacionado.
5. **Leitura explícita:** `POST /chat/channels/:id/read` substitui a marcação implícita ao buscar mensagens; o frontend envia confirmação quando a janela está visível e a conversa está no final.
6. **Atualização por eventos:** `ChatEventBus` em memória notifica membros autorizados sobre mensagens, anexos, digitação e leitura. O SSE dispara snapshots imediatamente, mantendo a reconsulta a cada 30 s como fallback. Eventos não carregam conteúdo sensível.

### Compatibilidade e limitações

- **Migração obrigatória** antes de usar a nova API: `npx prisma migrate deploy` dentro de `backend`, seguido da geração de Prisma Client na pipeline normal.
- A implementação atual mantém anexos em mensagens legadas, pois sua migração para tabela/armazenamento separado ainda não foi concluída.
- SSE funciona por processo único; implantação com múltiplas réplicas precisará de Redis/pub-sub compartilhado.
- O campo `clientMessageId` previne duplicatas quando repetido pelo cliente, mas ainda faltam testes concorrentes e estratégia completa de retry.
- O chat original permanece em arquivo grande. Extração de componentes e hooks, paginação infinita/virtualização, decisões persistidas, escalonamentos, busca avançada, painel contextual com dados vivos, métricas e layout de três colunas completo **continuam pendentes**.
- Não há captura Playwright de antes/depois nem homologação real em claro/escuro, por ausência de navegador autenticado conectado neste ambiente.
- Permissões de visualização dos dados de tickets/tarefas precisam ser integradas à política de escopo operacional antes de expor painel detalhado ou sugerir membros automaticamente.

### Verificações necessárias

```bash
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run build
cd backend && npx prisma migrate deploy
```

Validar em banco de homologação: mensagens antigas, sala já existente, sala não autorizada, reconexão SSE, usuário em outra aba, leitura fora do fim, envio duplicado, e 2 clientes criando a mesma sala.

### Próximas fases

1. Corrigir quaisquer falhas de CI e adicionar testes de integração para as operações novas.
2. Mover anexos para tabela/storage seguro, adicionar cursores e deduplicação robusta.
3. Separar `Chat.tsx` em componentes/hooks pequenos, preservar UI existente.
4. Painel de contexto com dados autorizados e sala colaborativa com gestão de membros.
5. Decisões, escalonamentos, handoff e pesquisa com permissões e auditoria.
6. Polimento visual, responsividade e Playwright antes/depois.

**Não realizar merge em main sem migração, testes e revisão de segurança.**
