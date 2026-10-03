# Changelog

### Dashboard e sessão
- Corrigida a sessão autenticada para não expirar após poucos minutos: timeout ocioso padrão ampliado para 8 horas, mantendo configuração por ambiente e heartbeat.
- `Tickets por Categoria` agora usa o mesmo cohort operacional de `Abertos no Período`.
- `Status dos Tickets` foi consolidado como `Status do Backlog do Período`, usando o período global do Dashboard e apenas tickets desse cohort que permanecem ativos.
- Removido o seletor de período independente do donut de status para evitar comparação de populações diferentes na mesma visão executiva.

## 2.0.0 LTS — 2026-10-02

### Release estável
- Atualizador Desktop passa a promover instalações RC/beta para uma versão estável superior quando houver `latest.yml`, permitindo a migração automática da linha 1.0.0-rc.x para a 2.0.0 LTS; após a promoção, instalações estáveis permanecem no canal latest.
- Primeira versão LTS do Hub Suporte Simer, promovendo o pacote validado da linha RC.20 para o canal estável.
- Consolida Dashboard e analytics Movidesk, Central da Coordenação, Central de Liderança Técnica, produtividade por apontamentos, Dados e Sincronizações e integração Azure DevOps.
- Padroniza a carteira operacional oficial em 2026+, com Causa exclusiva de Problema e Motivo exclusivo de Dúvida.
- Inclui enriquecimento estruturado de ações, apontamentos e históricos Movidesk, checkpoints de sincronização e diagnósticos de cobertura.
- Consolida os ajustes finais de UX, dark mode, filtros, drill-downs, relatórios gerenciais, administração e preparação Web/Desktop.

> Versão LTS destinada à publicação no canal estável após validação automática de backend, frontend, testes, instalador Desktop e imagem Web.

## 1.0.0-rc.20 — 2026-10-02

### Dashboard e dados Movidesk
- Causa e Motivo passam a ser calculados por endpoint analítico server-side, usando o período global do Dashboard e o mesmo conjunto de IDs no drill-down.
- Principais Causas considera exclusivamente tickets da categoria Problema e os valores oficiais de Causa.
- Motivos das Dúvidas considera exclusivamente tickets da categoria Dúvida e os valores oficiais de Motivo.
- Áreas de negócio e Serviços mais acionados deixam de compartilhar fallback: Área usa somente `businessArea` e Serviço usa somente `serviceSecondLevel`.
- Estados sem dados passam a refletir ausência real de preenchimento, sem fabricar classificação a partir de outra dimensão.

### Escopo operacional e produtividade
- Filtro Responsável da tela de Tickets restringido ao quadro oficial do Suporte SIMER.
- Tela de Analistas e Desempenho permanecem alinhadas ao mesmo quadro operacional.
- Produtividade por horas registradas utiliza apontamentos estruturados do Movidesk.
- Enriquecimento incremental mantém checkpoint e redução progressiva das pendências, sem reprocessar continuamente o mesmo lote.

### Varredura final de release
- Relatórios Gerenciais passam a respeitar explicitamente a base operacional oficial iniciada em 01/01/2026 no frontend e no backend, evitando períodos anteriores sem população canônica.
- Filtro de relatórios ganha atalhos Este mês, Mês passado, 90 dias e Desde 01/01/2026.
- Dados e Sincronizações passa a exibir a cobertura de Problema/Causa e Dúvida/Motivo e oferece a consolidação dessas classificações no workspace operacional.
- Feedback da consolidação de classificações permanece dentro da tela, sem diálogo bloqueante do navegador.
- Configurações deixa de afirmar um timeout fixo de sessão e passa a apresentar a política informada pelo diagnóstico do servidor.
- Administração de Usuários teve a nomenclatura do produto padronizada para Hub Suporte Simer.

### Desenvolvimento
- Correções, Evoluções e Apoios agora iniciam pela atualização mais recente do Azure (`azureChangedAt DESC`) e mantêm essa ordenação como padrão ao trocar de rotina.
- Filtros de Correções, Evoluções e Apoios foram movidos para imediatamente abaixo do cabeçalho, antes dos KPIs, gráficos, pipeline e qualidade de dados.
- Versões passa a iniciar em "Versão mais recente", com registros sem versão posicionados depois das versões identificadas.
- Filtros de Versões também passam a ocupar o topo da tela, imediatamente após o título, com apresentação mais compacta.
- Rótulo de ordenação foi alinhado à regra real: "Atualização mais recente/antiga", evitando chamar alteração geral do Work Item de mudança de estado.

### Central de Liderança Técnica
- Auditoria de classificação alinhada ao modelo Movidesk: Causa é exigida somente para Problema e Motivo somente para Dúvida; demais categorias não são sinalizadas indevidamente por ausência dessas dimensões.
- Recorrências deixam de usar Causa como fallback de tema técnico e priorizam Serviço/rotina e Categoria, reduzindo agrupamentos semanticamente incorretos.
- Sinais Azure passam a respeitar os filtros ativos de Cliente e Analista; sem filtro, permanece o portfólio SIMER completo.
- Vínculo Ticket ↔ Task otimizado por índice em memória, eliminando buscas lineares repetidas durante a análise.
- Comparação com período anterior deixa de produzir tendência quando a janela histórica ultrapassa o início oficial da base operacional (01/01/2026).
- Período recebe opção Mês passado, metadado mostra intervalo exato e indicadores individuais deixam de oferecer Personalizado sem datas próprias.
- Backlog e sinais de atenção foram renomeados como snapshot atual para não sugerir incorretamente que são uma coorte exclusiva do período.
- Drawer de auditoria passa a exibir separadamente Causa e Motivo.

### UX, sincronização e release
- Cards executivos revisados para manter proporções, período e drill-down consistentes.
- Dados e Sincronizações concentra diagnóstico de cobertura e ações operacionais de Movidesk.
- Release Web permanece baseada em imagem imutável, migration controlada e readiness antes de considerar a atualização concluída.
- Workflow bloqueia publicação sem seção correspondente no CHANGELOG e valida os artefatos Desktop antes da publicação.
- RC.20 consolida o pacote final destinado à validação da Coordenação.

> Release Candidate para validação da Coordenação. Publicar no canal beta após backend, frontend e testes concluírem sem erro.

## 1.0.0-rc.19 — 2026-10-02

- Dashboard de Causa/Motivo agora usa endpoint analítico server-side com o mesmo escopo SIMER e período global, eliminando divergência entre cobertura persistida e snapshot do frontend; drill-down usa os IDs retornados pela mesma consulta.
### Central da Coordenação e indicadores
- Revisão do painel SLA × OLA com separação entre tempo de Suporte, Desenvolvimento e SLA total.
- Indicadores por prioridade P1–P4, riscos em desenvolvimento, estouros de OLA/SLA e tratamento de linhas temporais inconsistentes.
- Refinamento visual dos gráficos, referências percentuais, legendas, tooltips e compatibilidade com Dark Mode.
- Ajustes de escopo para que análises gerenciais utilizem a carteira SIMER 2026+ de forma consistente.

### Dashboard e classificação Movidesk
- Categorias passam a respeitar o período global selecionado no Dashboard.
- Causa passa a ser uma dimensão exclusiva dos tickets da categoria Problema, limitada a Configuração, Erro operacional, Não identificada, Resolvido pelo usuário e SEFAZ ou aplicativo de terceiros.
- Solução contorno permanece exclusivamente como Categoria e deixa de ser interpretada como Causa; o valor legado “Bug no Produto / ERP (não Utilizar)” também não compõe a análise de causas.
- Motivo passa a ser uma dimensão exclusiva dos tickets da categoria Dúvida, limitado a Apoio processos operacionais, Configuração, Dúvida interna, Inexperiência do usuário, Informação, Integração com terceiros e Priorização.
- Novo card de Motivos das Dúvidas e revisão do card de Principais Causas.
- Backfill idempotente para consolidar Causa e Motivo a partir dos campos customizados já armazenados.
- Diagnóstico de cobertura para Problema/Causa e Dúvida/Motivo, incluindo customFieldId candidatos dos registros ainda não classificados.

### Movidesk, produtividade e qualidade dos dados
- Persistência estruturada de ações, apontamentos de horas, históricos de responsável e históricos de status.
- Checkpoint de enriquecimento para acompanhar cobertura, pendências e erros de sincronização.
- Produtividade por analista e capacidade da Coordenação passam a consumir apontamentos estruturados.
- Tela de Analistas restringida ao quadro oficial do Suporte SIMER (Alan, Débora, Diego, Luiz, Renan, Tayson e Thiago), impedindo que responsáveis de Produto/Fábrica contaminem rankings e tabelas.
- Produtividade por horas registradas reforçada no backend e frontend com o mesmo escopo oficial de analistas, mantendo os sete analistas mesmo quando ainda não há apontamento no período.
- Corrigido travamento de carregamento da produtividade por horas em React Strict Mode; o cálculo usa diretamente `timeAppointments.accountedTime` dos apontamentos Movidesk.
- Desempenho por analista passa a aceitar exclusivamente o mesmo quadro oficial do Suporte SIMER usado na tela de Analistas.
- Dashboard recupera Causa e Motivo diretamente dos campos adicionais já armazenados no payload Movidesk quando a coluna consolidada ainda estiver vazia, sem enviar o rawData pesado ao navegador.
- Consolidação de Causa/Motivo passa a reler diretamente do Movidesk uma janela recente de 62 dias, independente do enriquecimento de ações, corrigindo tickets antigos que não tiveram lastUpdate após a introdução das novas colunas locais.
- Atualização manual de classificações compartilha o coordenador de acesso à API Movidesk para não concorrer com sincronização e enriquecimento.
- Drawer de tickets enriquecido com ações, horas e histórico operacional.
- Escopo operacional canônico centralizado para clientes SIMER e carteira a partir de 2026.

### Polimento visual, UX e acessibilidade
- Densidade de botões, chips e tabelas centralizada no tema MUI para reduzir diferenças de proporção entre telas.
- Removidas sobrescritas CSS globais com !important que conflitavam com componentes e layouts responsivos.
- Cards deixam de cortar conteúdo interno por regra global de overflow, preservando tooltips, menus e visualizações mais complexas.
- Foco de teclado visível restaurado globalmente para controles interativos, mantendo a exceção específica dos elementos SVG dos gráficos.
- Dark Mode, responsividade, superfícies, filtros, tabelas, drawers e gráficos continuam compartilhando os mesmos tokens visuais do produto.

### Estabilidade e desempenho
- Redução de consultas auxiliares do snapshot do Dashboard.
- CSAT passa a utilizar a resposta mais recente por ticket nos pontos revisados.
- Melhorias de consistência entre filtros, drill-downs e indicadores gerenciais.
- Correções de build, tipagem e migration relacionadas à nova dimensão Motivo.

### Web, Desktop e release
- Imagem Web continua versionada junto ao release e executa migrations de forma controlada antes da aplicação.
- Processo de atualização Web documentado e automatizável com pull da imagem, migration, recriação e validação de readiness.
- Novidades da versão passam a acompanhar obrigatoriamente o release dentro do aplicativo e neste changelog.
- Atualizador Desktop mantém canal Beta/RC com verificação, download e instalação controlados.

> Release Candidate para validação da Coordenação. Publicar no canal beta somente após backend, frontend, testes e imagem Web concluírem com sucesso.


## 1.0.0-rc.16 — 2026-09-28

### Inteligência colaborativa
- Nova central de Problemas Conhecidos para compartilhamento operacional entre os analistas.
- Cadastro e edição com criticidade, status, cliente, serviço/rotina, versão, causa, solução, paliativo, tags e comentário interno.
- Busca contextual de Tickets Movidesk e Work Items Azure por múltiplos termos, sem exigir correspondência exata.
- Preenchimento assistido a partir de Ticket, Correção, Evolução ou APOIO e proteção contra cadastros duplicados.
- Navegação direta dos cards para o Ticket ou Work Item relacionado.

### Notificações e Desktop
- Preferências individuais de notificações e avisos operacionais no aplicativo.
- Indicador de notificações não visualizadas e notificações transitórias no canto inferior direito.
- Opção de iniciar automaticamente o TechLead Hub com o Windows.
- Correção do flicker dos controles de perfil, chat, calendário e notificações durante a rolagem.

### Análises e interface
- Mapa SIMER reorganizado dentro de Análises.
- Nova análise de demanda por categoria × serviço para identificar concentração de Bugs e demandas recorrentes.
- Refinamento visual global dos gráficos, com maior nitidez, proporção, legendas, tooltips e consistência entre temas.
- Padronizações adicionais de filtros, cards e navegação.

### Qualidade e integração
- Persistência idempotente dos novos dados de Problemas Conhecidos.
- Sincronização enriquecida com dados operacionais do Azure, evitando importar a descrição geral extensa da tarefa.
- Validação de duplicidade também durante a edição.
- Ajustes de compatibilidade do Desktop e inicialização automática restrita ao Windows.

> Release Candidate: publicar no canal beta após validação automatizada do workflow de release.

## 1.0.0-rc.9 — 2026-09-20

### Interface e experiência
- Modernização visual estrutural do TechLead Hub, com melhor consistência entre cards, cabeçalhos, filtros, tabelas, dialogs, drawers e estados de interação.
- Refinamentos de Light Mode e Dark Mode, incluindo contraste, superfícies, tooltips, eixos e componentes analíticos.
- Sidebar reorganizada com grupos iniciando recolhidos para reduzir ruído visual.
- Melhorias de responsividade e densidade de informação nas principais telas.

### Central da Coordenação
- Novo Navegador de Rotinas inspirado em navegação hierárquica, com macrogrupos de Cadastros, Movimentos, Análises, Desenvolvimento e Gestão.
- Busca de rotinas por nome, finalidade e palavras-chave.
- Favoritos e acessos recentes persistidos localmente.
- Nova análise gráfica de distribuição da carga operacional entre Tickets e itens Azure.

### Dashboards e análises
- Evolução dos gráficos do Dashboard, Clientes, Analistas, Performance, Versões e Azure Work Items.
- Legendas interativas com exibição e ocultação de séries/categorias onde aplicável.
- Tooltips e componentes gráficos adaptados aos temas claro e escuro.
- Novo mapa gráfico de pendências em Qualidade dos Dados.
- Novo Pulso Operacional na Central de Liderança Técnica.
- Refinamentos na leitura executiva e no drill-down das análises.

### Operação
- Modernização visual do Kanban de Minha Operação, preservando a organização compacta e melhorando feedback de drag-and-drop, hover e foco.
- Padronização dos painéis laterais de detalhes e campos de investigação.
- Melhorias de navegação entre Tickets, Correções, Evoluções, Apoios, Versões e áreas gerenciais.

### Qualidade e release
- Correções de compilação introduzidas durante a modernização dos gráficos.
- Ajustes de contraste e comportamento do Briefing Executivo da Central de Liderança no modo claro.
- Rotas da Central da Coordenação conferidas contra as rotas disponíveis na aplicação.
- Pacote Desktop preparado como `1.0.0-rc.9`.

> Release Candidate: validar o pacote completo de Desktop, backend e frontend antes da publicação no canal beta.
