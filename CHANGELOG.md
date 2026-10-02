# Changelog

## 1.0.0-rc.19 — 2026-10-02

### Central da Coordenação e indicadores
- Revisão do painel SLA × OLA com separação entre tempo de Suporte, Desenvolvimento e SLA total.
- Indicadores por prioridade P1–P4, riscos em desenvolvimento, estouros de OLA/SLA e tratamento de linhas temporais inconsistentes.
- Refinamento visual dos gráficos, referências percentuais, legendas, tooltips e compatibilidade com Dark Mode.
- Ajustes de escopo para que análises gerenciais utilizem a carteira SIMER 2026+ de forma consistente.

### Dashboard e classificação Movidesk
- Categorias passam a respeitar o período global selecionado no Dashboard.
- Causa passa a ser uma dimensão exclusiva dos tickets da categoria Problema.
- Motivo passa a ser uma dimensão exclusiva dos tickets da categoria Dúvida.
- Novo card de Motivos das Dúvidas e revisão do card de Principais Causas.
- Backfill idempotente para consolidar Causa e Motivo a partir dos campos customizados já armazenados.
- Diagnóstico de cobertura para Problema/Causa e Dúvida/Motivo, incluindo customFieldId candidatos dos registros ainda não classificados.

### Movidesk, produtividade e qualidade dos dados
- Persistência estruturada de ações, apontamentos de horas, históricos de responsável e históricos de status.
- Checkpoint de enriquecimento para acompanhar cobertura, pendências e erros de sincronização.
- Produtividade por analista e capacidade da Coordenação passam a consumir apontamentos estruturados.
- Drawer de tickets enriquecido com ações, horas e histórico operacional.
- Escopo operacional canônico centralizado para clientes SIMER e carteira a partir de 2026.

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
