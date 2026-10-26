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

7. **Registro operacional persistido:** tabela `ChatIncidentAction` e endpoints para criar, listar e atualizar decisões, escalonamentos, handoffs e ações, com auditoria, controle de membros e painel dedicado no frontend. O responsável por uma ação pode ser informado via API, mas a UI inicial registra ações sem atribuição automática.

8. **Pesquisa de histórico:** endpoint de busca textual por canal, limitado a membros e 50 resultados, com diálogo dedicado no frontend; pesquisa no banco inclui mensagens anteriores às últimas 100.
9. **Terceira coluna contextual:** salas de incidentes exibem automaticamente informações de origem, cliente e atalhos de ações/pesquisa em monitores largos; layouts menores mantêm duas colunas.

### Compatibilidade e limitações

- **Migração obrigatória** antes de usar a nova API: `npx prisma migrate deploy` dentro de `backend`, seguido da geração de Prisma Client na pipeline normal.
- A implementação atual mantém anexos em mensagens legadas, pois sua migração para tabela/armazenamento separado ainda não foi concluída.
- SSE funciona por processo único; implantação com múltiplas réplicas precisará de Redis/pub-sub compartilhado.
- O campo `clientMessageId` previne duplicatas quando repetido pelo cliente, mas ainda faltam testes concorrentes e estratégia completa de retry.
- O chat original permanece em arquivo grande. Extração de componentes e hooks, paginação infinita/virtualização, pesquisa multi-canal e indexação de busca, painel contextual com dados vivos, métricas e layout de três colunas completo **continuam pendentes**.
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
5. Evoluir o registro básico de decisões, escalonamentos e handoff com atribuição, notificações e pesquisa autorizada.
6. Polimento visual, responsividade e Playwright antes/depois.

**Não realizar merge em main sem migração, testes e revisão de segurança.**

## Revisão da evolução visual (25/10/2026)

O usuário relatou commit local `ff20d42` na branch `feat/evolucao-visual-design-system`, contendo Inter auto-hospedada, KpiGrid balanceado, tokens de raio e aviso recolhível em Tickets. **A branch não está publicada no GitHub remoto** na data da verificação; portanto, não houve inspeção do diff, cherry-pick nem integração. O typecheck foi informado pelo usuário, não reproduzido aqui. Permanecem pendentes build, lint, screenshots e os itens visuais mencionados pelo usuário. Evitar sobrescrever esses arquivos até disponibilizar o commit remoto.

## Diagnóstico de continuidade (25/10/2026)

- O pipeline de imagem Docker do commit `f9947598` falhou por TypeScript TS2345 em `backend/src/routes/cooperative-news.routes.ts` (grupo opcional da expressão regular). Correção mínima enviada no commit `fdd5add6`, aplicando `match[1] ?? ""`; aguarda validação na próxima CI.
- A análise do SSE detectou que `chat.routes.ts` declara `sequence`, mas os snapshots enviados não têm campo `id:` e não há replay de `Last-Event-ID`. A publicação em memória acelera o refresh, porém não garante entrega de eventos durante desconexões. Manter isso como pendência real, sem descrever o requisito como concluído.
- `Chat.tsx` ainda contém a maior parte das telas e regras; separar por componentes/hooks em alterações posteriores com testes, sem alterar o comportamento legado.
- O painel lateral atual apresenta metadados do canal e atalhos; dados operacionais vivos, segregação por escopo do ticket e gerenciamento seguro de participantes ainda não foram homologados.
- A branch permanece isolada da `main`; não fazer merge antes da validação de build, migrations, testes e autorização de acesso.


## Atualização: extração do Composer e anexos persistidos (25/10/2026)

- O Composer foi extraído para `frontend/src/components/chat/Composer.tsx`, mantendo as ações existentes e o envio de eventos de digitação na página.
- Nova migração `20261025190000_chat_secure_attachments`: tabela `ChatAttachment` com canal, mensagem, nome, MIME, tamanho, SHA-256 e binário `BYTEA` no PostgreSQL.
- Novos uploads: validação de tamanho (8 MB), lista de MIME, assinaturas básicas para PDF/imagens/ZIP e persistência transacional. A mensagem recebe `kind=ATTACHMENT` e deixa de carregar Base64 no campo `content`.
- Download: `GET /chat/channels/:channelId/attachments/:messageId` com checagem de pertencimento e `Content-Disposition: attachment`; frontend solicita o binário via API autenticada.
- Anexos legados `[anexo]` continuam renderizados sem migração destrutiva.
- **Limitações:** upload ainda trafega Base64 no JSON HTTP; armazenamento é no banco, não objeto externo; validação por assinatura não substitui antivírus; não há testes de integração executados nesta sessão.
- **Antes de executar o novo backend:** `cd backend && npx prisma migrate deploy && npx prisma generate && npm run build`. No frontend: `npm run lint && npm run build`.
- **Ainda pendente:** hooks, virtualização, SSE replay completo, contexto vivo, comandos, handoff, notificações, responsividade definitiva, screenshots e testes de segurança/performance. A missão integral permanece aberta.


## Evolução visual — primeira entrega (25/10/2026)

- Banner "Hub de Conversas" ocultado enquanto uma conversa estiver selecionada, liberando altura útil.
- Layout principal agora usa grid responsivo com três colunas em telas grandes quando o painel está ativo, e duas colunas nos demais casos; cores e sombras vêm do tema MUI.
- Conversas agrupadas visualmente em Incidentes ativos, Favoritos, Equipes e Conversas diretas, mantendo a ordem interna existente em cada grupo.
- Cabeçalho da conversa mais compacto e responsivo, com melhor truncamento e ações de acessibilidade.
- **Ainda não entregue:** gaveta de contexto para telas menores, navegação mobile lista → conversa, painel com dados vivos, refinamento de mensagens/composer, screenshots de comparação e verificação visual.
- Executar `cd frontend && npm run lint && npm run build` após atualizar a branch. Essas validações não foram executadas nesta sessão.


## Evolução visual — segunda entrega (25/10/2026)

- Composer com pré-visualização de arquivo, cancelamento, arrastar e soltar, colar arquivos da área de transferência, indicação de erro, MIME permitido e limite de 8 MB; envio do anexo segue explícito pelo botão "Enviar arquivo".
- Bolhas de mensagem com superfícies derivadas do tema MUI, melhor largura responsiva, ações ao hover/foco e rótulos acessíveis.
- Drawer de informações da conversa em larguras menores que o breakpoint `lg`; o painel lateral permanece no grid desktop a partir de `lg`.
- **Pendente de validação local:** `npm run lint` e `npm run build` no frontend, testes de arrastar/colar/upload, screenshots e verificação mobile. Ainda falta a navegação mobile lista/conversa completa e painel contextual com dados vivos.


## Navegação mobile — terceira entrega (25/10/2026)

- Em telas `xs`, a lista de conversas é exibida isoladamente até o usuário selecionar um canal.
- A seleção de conversa abre a visualização de mensagens em tela cheia, com ação "Voltar para conversas".
- Abertura por conversa direta, criação de canal, sala contextual e aviso de nova mensagem também navega para a conversa no mobile.
- Layout desktop `md+` mantém lista e mensagens lado a lado; o painel contextual responsivo permanece disponível.
- **Pendente:** teste local `npm run lint && npm run build`, validação manual nos breakpoints e testes E2E.


## Evolução visual — mensagens e participantes (25/10/2026)

- Mensagens agora têm avatar com iniciais reais do autor, nome e horário na primeira mensagem de cada sequência.
- Mensagens consecutivas do mesmo autor, com intervalo inferior a cinco minutos e na mesma data, são agrupadas visualmente; a data sempre reinicia o agrupamento.
- Área de leitura centralizada com largura máxima de 1120px; balões de largura adaptativa, superfície suave e ações de responder/fixar acessíveis.
- Menções, anexos persistidos e legados, respostas e cards operacionais continuam suportados.
- Os avatares usam iniciais, não fotografias: o modelo atual de usuário não fornece URL de foto.
- **Validação pendente:** lint, build e revisão manual em temas claro/escuro, mobile e histórico longo.


## Evolução visual — lista de conversas (25/10/2026)

- Itens de conversa com avatar de 42px, iniciais para conversas diretas, ícones para canais e incidentes e indicador de presença online.
- Nome, prévia de mensagem, horário contextual (hoje/ontem/data), indicação de digitação e contador de não lidas em layout compacto.
- Agrupamentos existentes preservados; favoritos continuam acessíveis pelo botão próprio, sem abrir a conversa acidentalmente.
- Nenhuma fotografia ou mensagem fictícia foi adicionada; os dados são os retornados pelas APIs.
- **Validação pendente:** lint, build, screenshots e inspeção de estados de hover, foco, tema escuro e canais com nomes longos.


## Revisão baseada em captura real — 25/10/2026

- Captura real confirmou boa evolução da lista e dos balões, mas destacou cabeçalho com duas buscas e ausência do painel de compartilhamentos em monitor largo.
- Em breakpoint `xl`, o painel de informações e arquivos agora é exibido por padrão ao selecionar conversa, com alternância pelo botão de informações. Breakpoints menores preservam abertura manual.
- Removida a busca inline duplicada do cabeçalho; o ícone de pesquisa abre a busca de histórico existente.
- Painel direito usa superfície integrada ao workspace e separador vertical, reduzindo o aspecto de cartão administrativo.
- Nenhuma mensagem, imagem ou anexo de exemplo foi criado; a galeria reflete apenas arquivos realmente carregados.
- **Validação necessária no ambiente local:** `npm run lint`, `npm run build`, screenshot desktop com conversa aberta e testes dos controles de painel e pesquisa.


## Refinamento do painel direito — 25/10/2026

- Cabeçalho compacto "Informações e arquivos", sem avatar grande redundante.
- Seções de compartilhamentos recolhíveis e acessíveis, com contagem de imagens, vídeos e arquivos.
- Cinco anexos recentes por seção, com ação "Ver todos" para expandir os anexos já carregados; arquivos continuam baixados pelo endpoint autenticado.
- Filtragem explícita por `channelId` para não misturar anexos de conversas ao alternar rapidamente.
- **Limitação:** não há thumbnails autenticadas nem consulta a todo o histórico; as seções mostram apenas anexos presentes nas mensagens já carregadas.
- **Validação pendente:** lint/build local, screenshot desktop e testes de expansão, download e alternância de conversa.


## Refatoração incremental — diretório e visualização de mensagens (25/10/2026)

- Extraído `components/chat/hooks/useChannelDirectory.ts`: normalização de conversas diretas duplicadas, manutenção da conversa selecionada, busca local, ordenação e total de não lidas.
- Extraído `components/chat/hooks/useMessageView.ts`: filtro de mensagens, pins legados e destaques operacionais.
- `Chat.tsx` passou de aproximadamente 944 para 886 linhas. A separação completa em hooks de rede, SSE, envio, presença e painéis continua pendente; nenhuma mudança de contrato/API foi introduzida nesta etapa.
- **Validação pendente:** `npm run lint` e `npm run build` no frontend, além de testes de seleção de DMs duplicadas, filtros, mensagens fixadas e alternância de canais. Não considerar concluída a Fase 1.


## Bloco técnico ampliado — hooks de comunicação e presença (25/10/2026)

- Criado `useChatRealtime.ts`: conexão SSE isolada, callbacks atuais via refs, reconexão com backoff exponencial limitado a 30 segundos e jitter, interpretação tolerante de eventos e atualização de canais/mensagens ao reconectar. **Não é replay durável por Last-Event-ID**; essa capacidade exige suporte do servidor.
- Criado `useChatPresence.ts`: estado Online/Ausente/Ocupado, persistência local, heartbeat de 25 segundos e atualização quando a aba muda de visibilidade.
- Corrigida a rolagem do histórico ao carregar páginas antigas: uma atualização que insere mensagens no início não deve forçar a rolagem para o fim.
- `Chat.tsx` foi reduzido de cerca de 886 para 825 linhas, preservando contratos de API e layout atual.
- **Pendente antes de homologação:** lint/build no checkout local; teste manual de desconexão/reconexão, status de presença, paginação com 100+ mensagens e alternância rápida de canais.
- **Ainda pendentes no prompt original:** divisão adicional de estado e UI, testes automatizados, replay durável SSE, virtualização, painel com dados vivos de Movidesk/Azure, passagem de turno estruturada e comandos operacionais.


## Bloco ampliado de confiabilidade — 25/10/2026

- Novo `useChatReadReceipts`: deduplicação por canal, limite de frequência de cinco segundos, bloqueio de requisições simultâneas e verificação do canal selecionado antes de atualizar o contador de não lidas.
- Novo `useChatTyping`: emissão de digitação com throttle de 2,5 segundos, inatividade de 1,2 segundo e encerramento do indicador ao trocar de conversa/desmontar.
- `useChatRealtime`: fallback de sincronização de canais e mensagens a cada 30 segundos, inclusive quando o SSE continua conectado, e atualização ao retornar à aba. Não substitui replay durável de eventos no backend.
- `Chat.tsx`: removido o bootstrap dependente da contagem de canais, que repetia buscas após mudanças na lista.
- Refresh de mensagens em segundo plano não cancela o carregamento inicial nem altera indevidamente o indicador de carregamento.
- **Não homologado:** é obrigatório executar `npm run lint`, `npm run build` e `npm run test` no frontend e verificar manualmente reconexão, status de digitação, leitura e troca de canais.
- **Ainda pendente:** refatoração integral da página, testes de integração automatizados, replay SSE `Last-Event-ID`, virtualização, integrações com tickets/tarefas e workflows operacionais completos.


## Bloco maior — extração de histórico e envio (25/10/2026)

- `useChatHistory.ts`: gerenciamento de mensagens, carregamento inicial, sincronização silenciosa, paginação por cursor, preservação da posição de leitura, indicador de novas mensagens e cancelamento de requisições ao trocar de conversa.
- Carregamentos de histórico, páginas anteriores e atualizações silenciosas usam controladores independentes; respostas de um canal anteriormente selecionado não alteram a conversa atual.
- A mesclagem de mensagens é feita por ID para evitar duplicações entre páginas e atualizações.
- `useChatSend.ts`: envio de texto com `clientMessageId` idempotente, proteção contra envios simultâneos, resposta descartada após troca de canal e preservação do rascunho em caso de falha.
- A página mantém o indicador de envio compartilhado com emojis e figurinhas; busca e resposta em andamento são limpas ao alternar conversas.
- **Validação pendente:** `npm run lint`, `npm run build` e `npm run test`; cenários manuais com 100+ mensagens, troca rápida de canal, falha de envio, reconexão e envio de emoji/figurinha.
- **Limites:** não há ainda envio otimista de mensagens, virtualização, testes de integração de UI nem replay persistente de SSE. Integração viva Movidesk/Azure e passagem de turno estruturada continuam pendentes.


## Pacote de estabilização e acompanhamento de incidentes — 26/10/2026

- `useChatHistory`: requisições concluídas deixam de ocupar os controladores de cancelamento; atualização do indicador de carregamento verifica canal ativo, reduzindo efeitos de respostas atrasadas.
- `IncidentWorkSummary`: nova visualização de acompanhamento no painel contextual de salas de incidente, consultando o endpoint autenticado `GET /chat/channels/:channelId/actions` em vez de dados fictícios. Exibe pendências, decisões, escalonamentos, passagem de turno, responsáveis e prazos quando informados.
- Atualização da visão contextual após criar ou alterar uma ação no `IncidentActionsPanel`, por evento local de escopo de canal, e ao retornar à aba. O diálogo existente permanece como editor autorizado.
- Testes de backend adicionados para isolamento de destinatários, deduplicação, tolerância a falha de listener e cancelamento de assinatura do `ChatEventBus`.
- **Validação pendente:** `frontend: npm run lint && npm run build && npm run test`; `backend: npm run test && npm run build`. Ainda não executados neste ambiente.
- **Não considerar concluído:** SSE durável com replay/Redis, painel vivo com dados de ticket e Azure, testes end-to-end de upload/acesso, busca avançada unificada, responsividade do acompanhamento em telas pequenas e auditoria completa de permissões.


## Robustez adicional — 26/10/2026

- Cancelamento explícito de todas as requisições do histórico quando o canal muda ou o componente desmonta; inclui paginação e sincronização silenciosa.
- Confirmação de leitura condicionada à visibilidade da aba.
- Resumo de ações de incidentes sincronizado a cada 60 segundos enquanto visível, além da atualização após edição e retorno à aba; indicador do horário da última consulta bem-sucedida.
- **Critério de aceite antes de encerrar:** executar lint, build e testes do frontend, testes e build do backend e fluxo manual de dois usuários (conversa, anexo, leitura, canal, incidentes). Não homologar a partir de commits sem validação.


## Desempenho e concorrência — 26/10/2026

- `messagePresentation.ts` centraliza a preparação de agrupamento, menções e vínculo com mensagens respondidas; referências a respostas usam índice por ID, evitando busca linear para cada item do histórico.
- `MessageList` consome o preparo compartilhado e mantém as mesmas propriedades visuais da bolha de mensagem.
- `useChatHistory` ignora erros de requisições que já pertencem a outro canal e impede que paginações abortadas alterem o indicador de carregamento do canal ativo.
- **Pendente de homologação local:** frontend lint/build/test, backend build/test, navegação rápida entre canais, mensagens respondidas e histórico paginado.


## Pacote de anexos e renderização — 26/10/2026

- `Composer` associa arquivos preparados ao canal selecionado e limpa o estado de preparação na troca de conversa, reduzindo o risco de envio acidental a outro destinatário.
- Bloqueios de interação durante envio evitam tentativas concorrentes de preparar/enviar anexos.
- `MessageList` memoriza o preparo linear do histórico, reduzindo trabalho repetido em renders causados por presença, digitação e outros estados.
- **Pendente de validação:** lint, build, testes, troca de canal com anexo preparado, arrastar/colar arquivo, envio concorrente e upload em rede lenta.
- **Limitação conhecida:** a função de upload de `Chat.tsx` ainda precisa de isolamento completo do canal de origem durante uma leitura assíncrona do arquivo. Não homologar esse cenário sem teste integrado.


## Upload por canal e regressão de mensagens — 26/10/2026

- Extraído `useChatAttachment` do componente de página; captura o canal de origem antes da leitura assíncrona e envia o anexo exclusivamente para esse canal.
- Respostas de upload não recarregam nem exibem erro na conversa que foi selecionada posteriormente; guarda de operação em andamento impede upload concorrente.
- Criados quatro testes de apresentação de mensagens: agrupamento temporal, resposta a mensagem fora do filtro, menção sem diferenciar maiúsculas/minúsculas e separação de dias independente do fuso da máquina.
- **Homologação ainda necessária:** frontend lint/build/test, backend build/test, envio de arquivo com troca de canal durante FileReader/rede lenta e testes entre dois usuários.


## Validação frontend e transporte SSE — 26/10/2026

- Validação local reportada: frontend build de produção concluído, 10/10 testes aprovados e lint com apenas um aviso de importação não utilizada. Importação removida.
- Novo decodificador `sseFrames.ts` utilizado pelo hook de tempo real para eventos recebidos em fragmentos, CRLF, comentários de heartbeat e dados multilinha.
- Quatro novos testes de regressão para SSE, incluindo quebra de CRLF entre chunks.
- **Limite atual:** o decodificador de frames não implementa replay persistente no servidor; o fallback de sincronização continua necessário. Ainda faltam build/testes do backend e testes integrados de dois usuários.
