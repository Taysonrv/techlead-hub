# Changelog

## 2.1.0-rc.9 — 2026-10-29

### Operação e indicadores
- Dashboard e Desempenho/SLA receberam padronização visual, linhas retas nos gráficos e revisão dos indicadores operacionais.
- Pendências ganhou recorte por analista e ajustes para não classificar Tasks concluídas como pendências, além de melhorias na leitura da dívida operacional.
- Cards de backlog e resolução por agente receberam ajustes de apresentação e interação para análise da coordenação.

### Notificações e colaboração
- Novos fluxos opcionais do Teams cobrem tickets Novos encaminhados às equipes de Suporte e Tasks Azure abertas pelo N3 ou retornadas ao estado Registro, com controles independentes.
- A sincronização completa/histórica não dispara alertas de eventos antigos como se fossem novos.
- Notificações do Desktop podem aparecer com som quando o aplicativo está minimizado; permanecem disponíveis no sino até serem lidas.
- O painel lateral de Tasks destaca a última alteração e usa ações rápidas mais compactas.

### Desktop, calendário e estabilidade
- O calendário associa a cidade da previsão ao usuário e resume as condições meteorológicas nos dias disponíveis.
- A identidade visual foi refinada em ícones, sidebar, cards e gráficos, nos temas claro e escuro.
- A inicialização do Desktop prepara estruturas compatíveis do banco para as novas funções de clima e notificações, preservando as configurações existentes durante atualizações.
- A tela de novidades apresenta todos os destaques da versão no primeiro acesso e volta a aparecer quando uma nova versão é instalada.

> Pré-release beta. Validar o CI, instalação/atualização Desktop, integração PostgreSQL e os fluxos operacionais no ambiente de homologação antes da publicação.

## Em preparação — modernização visual executiva (branch de homologação)

### Fundação de apresentação
- Diagnóstico do frontend React/MUI/Vite e plano de migração por fases, preservando contratos de API, rotas, Prisma e backend.
- Tokens CSS semânticos de tema claro e escuro: superfícies, texto, bordas, destaques, estados, espaçamento, raios, sombras, tipografia e movimento reduzido.
- Melhorias incrementais prévias nos indicadores, seções, cabeçalhos, filtros, tabelas e estados de conteúdo.
- Dashboard: indicadores essenciais passam a aparecer imediatamente após o cabeçalho, antes dos atalhos e do workspace; título de seção e contagem de indicadores adicionados sem alterar métricas ou filtros.
- Estados de conteúdo: wrapper genérico AsyncState e suporte opcional a retry, ação vazia e detalhe técnico; adoção pelas telas segue em andamento.
- Reorganização da análise secundária do Dashboard com títulos executivos e espaçamento consistente; gráfico de evolução permanece em destaque.
- Sidebar com superfície azul-marinho em gradiente; busca global da topbar com superfície elevada e maior área de interação.
- Componente `StatusPill` tipado criado para adoção progressiva em telas operacionais (sem alteração de status de negócio).
- Telas Tickets e Clientes passaram a usar `AsyncState` para carregamento/erro sem alterar as consultas; indicadores de risco de Clientes adotam `StatusPill`.
- Pontos de Atenção e Desempenho passaram a usar `AsyncState` para carregamento/erro; indicador de indício de encerramento adota `StatusPill`.
- Minha Operação e Pendências: carregamento padronizado com `AsyncState`/`ContentState`; Pendências recebe estado vazio contextual e erro de carregamento, mantendo filtros, Kanban e listas.
- Analistas, Serviços e Versões: adoção de `AsyncState` nos carregamentos/erros iniciais, preservando gráficos, filtros e ações.
- Configurações e Usuários: estados de carregamento migrados para `ContentState`; demais módulos ainda exigem auditoria individual e homologação desktop.
- Liderança Técnica e Central da Coordenação: estados iniciais de carregamento/erro padronizados; Coordenação mantém ação de tentar novamente e estado vazio contextual.
- Base de Conhecimento: status de conexão com Wiki Azure padronizado via `StatusPill` e estado vazio via `ContentState`.
- Central de Investigação: estados de início e ausência de correlações migrados para `ContentState`.
- Mapa SIMER: carregamento inicial da investigação migrado para `ContentState`, preservando o indicador de carregamento da árvore.
- `ContentState` passa a utilizar tokens semânticos de superfície, borda e raio, melhorando consistência claro/escuro.
- Diagnóstico preliminar do backend documentado em `docs/backend-evolution-diagnostic.md`, sem alterar API, schema ou dependências.
- Segurança dos uploads Movidesk: validação preliminar de extensão e assinatura ZIP para XLSX e conteúdo inicial JSON antes de preview/importação; testes unitários adicionados.
- Consolidação visual: painéis de gráficos com superfícies semânticas claro/escuro e cabeçalhos compactos em telas pequenas.
- Responsividade: tabelas com rolagem horizontal contida no painel, prevenção de overflow em cards e espaçamento reduzido em células no mobile.
- Cabeçalhos de páginas: título fluido em janelas estreitas, espaçamento adaptativo e sombras padronizadas.
- Seções executivas: superfícies, sombras e cantos conectados aos tokens visuais compartilhados.
- Shell Web/Electron: limites de largura para o conteúdo principal em janelas redimensionadas; busca global e avisos de atualização limitados ao espaço disponível.
- Sidebar: modo compacto de 76 px com navegação por ícones, alternância expandir/recolher, preferência local persistente e atalho de perfil no rodapé.
- Dashboard executivo: aproximação visual da referência enviada, com cards em gradientes azul/turquesa, realce de gráficos, profundidade sutil nos temas claro/escuro e ajustes mobile; preservados KPIs e séries reais.
- Sidebar compacta: removido perfil duplicado (permanece apenas o superior), eliminadas setas dos grupos recolhidos e aprimorados separadores, seleção e badges dos ícones.
- Dashboard executivo: grade de KPIs responsiva com quatro colunas em desktop amplo e painéis analíticos em duas colunas a partir de telas grandes; sem alteração dos indicadores ou drilldowns.
- Clientes: aplicado o padrão visual executivo do Dashboard aos KPIs operacionais, cards, gráficos e tabela responsiva; mantidos filtros, drilldowns, dados reais e layout de impressão/PDF.
- Dashboard (composição visual, etapa 3): gráfico principal de evolução acompanhado por painel de leitura executiva em telas amplas, KPIs clicáveis com dados existentes e acabamento consistente na grade analítica inferior; backlog identificado como fotografia atual.
- Correção de propriedades duplicadas do tema MUI (TS1117) e documentação do carregamento inicial no Assistente de Análise; CI da correção aprovado.
- Tema MUI centraliza estilos de tabelas (cabeçalhos fixos, números tabulares, hover, scroll contido) e chips por meio dos tokens semânticos.

> Etapa visual incorporada à 2.1.0-rc.9. Consulte a seção acima para o escopo desta pré-release.

## 2.1.0-rc.8 — 2026-10-17

### Central da Coordenação e rastreabilidade
- Cards de Tickets, vínculos de Tasks, Work Items e Serviços passam a abrir detalhamentos consultados no backend, com registros operacionais em vez de dados agregados repetidos.
- Novo endpoint de detalhamento respeita o escopo operacional e o período selecionado, com limites de consulta para preservar o desempenho.
- Listagens apresentam informações contextuais e caminhos para acessar os registros relacionados.

### Acompanhamento Azure e análise operacional
- Incluído MVP para acompanhar Work Items Azure por usuário e receber notificações de alterações sincronizadas, respeitando a carteira SIMER.
- Adicionada investigação de SLA com componentes explicáveis e detalhamento contextual.
- Polimento da auditoria de encerramentos, filtros, indicadores, tabela e drawer.

> Pré-release beta. Validar builds, testes automatizados, fluxos Web/Desktop e integração com PostgreSQL em homologação antes de publicar. A migration de acompanhamento de Tasks deve ser revisada e aplicada somente conforme o processo aprovado do ambiente; não executar migrações diretamente na base de produção como parte da preparação da release.

## 2.1.0-rc.7 — 2026-10-15

### Operação e qualidade
- Tela Clientes: critérios operacionais alinhados ao Dashboard, séries mensais por tipo, SLA de primeira resposta e solução e taxa de resolução.
- Auditoria de encerramentos: identificação com evidências, filtros Produto/Suporte e carteira oficial SIMER, drawer e exportação; prevenção de falsos positivos.
- Painel de Tasks de Correções: cabeçalho da tabela harmonizado com os modos claro e escuro.
- Chat: reconexão SSE com intervalos progressivos para indisponibilidade de conexão e encerramento do stream.
- Notificações: toasts informativos, de sucesso e alerta com dimensões consistentes e conteúdo limitado sem sobreposição.
- Desktop: até cinco tentativas escalonadas de recuperação do backend local após encerramento inesperado, preservando a bandeja.
- Backend: recuperação de PostgreSQL independente da descriptografia de credenciais da integração.
- Configurações e Dados/Sincronizações: diagnósticos avançados e gerenciamento de sessões agrupados sem excluir recursos necessários.
- Infraestrutura Web: recomendações TLS/HTTPS com proxy reverso e SSE sem buffering, além de checklist de homologação.

> Beta para testes finais: a configuração do certificado TLS no FQDN corporativo, a reconexão real e os fluxos de integração precisam de validação no ambiente da infraestrutura. Não executar migração criptográfica de registros durante a publicação.

## 2.1.0-rc.6 — 2026-10-14

### Recuperação administrativa de credenciais
- Adicionada validação administrativa, somente leitura, da chave original contra os registros de integração criptografados.
- Tela de Configurações oferece recuperação para instalações Desktop que apresentem chave incompatível.
- Electron solicita confirmação, armazena a chave validada pelo Windows safeStorage e reinicia para reaplicar a configuração.
- Mantidas as proteções de compatibilidade com JWT_SECRET legado e o inventário de registros operacionais não criptografados.

> Versão beta de homologação da recuperação do Desktop. Não executa migração criptográfica dos registros do PostgreSQL; não utilizar a opção --apply da ferramenta de migração. A chave original deve ser preservada e informada somente na interface local protegida.

## 2.1.0-rc.5 — 2026-10-13

### Diagnóstico de credenciais (Desktop e Web)
- Incluído diagnóstico administrativo, somente leitura, para identificar se a instância consegue descriptografar credenciais de integração já armazenadas.
- Incluído o botão **Diagnosticar credenciais** na tela Configurações, utilizando a sessão autenticada do sistema, sem copiar tokens pelo navegador.
- Os resultados distinguem credenciais legíveis, incompatibilidade da chave e indisponibilidade de verificação; a origem da chave é apresentada sem revelar segredos.
- Limitadas as notificações nativas do Windows ao aplicativo Desktop, evitando alertas duplicados emitidos pelo navegador.

> Release Candidate de diagnóstico. Esta versão não recupera automaticamente registros criptografados com outra chave. Validar no Desktop instalado e no Docker antes de migrar as credenciais.

## 2.1.0-rc.4 — 2026-10-13

### Correções críticas de estabilidade
- Corrigida a incompatibilidade entre Prisma Client e Debian/OpenSSL 3 na imagem Docker Web, com geração explícita do engine de produção.
- Corrigido o uso de `pg_advisory_xact_lock` no chat para os tipos esperados pelo PostgreSQL.
- Falhas ao descriptografar configurações não são mais confundidas com indisponibilidade do banco na inicialização.
- Carregamento de credenciais passa a ser atômico e apresenta diagnóstico sem expor segredos.
- Tela de Configurações distingue falhas de consulta de integrações não configuradas e recupera as áreas independentes mesmo se algum diagnóstico auxiliar falhar.

> Release Candidate beta. A correção não recupera automaticamente credenciais criptografadas com outra chave. Validar a configuração original do Desktop e o health check da imagem Docker em homologação antes de promover.

## 2.1.0-rc.3 — 2026-10-13

### Dados operacionais e Azure
- Padronizada a carteira SIMER entre Movidesk, Azure, filtros, relatórios, busca e drill-downs, incluindo aliases exatos de clientes já homologados.
- Apuração mensal de Correções reforça histórico de abertura/fechamento, backlog auditável e avisos para leituras parciais, sem preencher totais com referências.
- Recuperação de metadados Movidesk e incremental revisadas, com diagnóstico mais explícito de falhas Azure e de conexão.

### Dashboard, colaboração e notificações
- Botão Atualizar dados com alinhamento, ícone e carregamento; última leitura do Hub distinguida da sincronização remota.
- Notificação de entrada online de outros usuários autenticados, ligada ao Chat, com prevenção de alertas por heartbeat e armazenamento da leitura.
- Ajustes em chat, notificações e responsividade dos indicadores em temas claro e escuro.

### Implantação Web e Docker
- Exemplo de Compose para PostgreSQL externo com validação das variáveis obrigatórias antes da inicialização, reinícios limitados e migrations desativadas por padrão.
- Documentadas as duas modalidades de banco de dados e comandos seguros de validação e diagnóstico.

> Release Candidate beta. Validar conexão com PostgreSQL, telas operacionais e integridade das apurações no ambiente antes de promover para estável.


## 2.1.0-rc.2 — 2026-10-06

### Operação personalizada e colaboração
- Tickets e Analistas passam a iniciar focados no analista autenticado quando houver correspondência com a squad SIMER, mantendo o filtro removível pelo usuário.
- Links compartilhados no Chat abrem diretamente o atendimento ou a Task correspondente, preservando parâmetros também nas rotas legadas.
- Minha Operação recebe maior área útil de Kanban para reduzir rolagem interna.

### Analistas e inteligência operacional
- Tela de Analistas recebe leitura rápida da carteira, equilíbrio de carga e comparação com o período anterior.
- Produtividade por horas foi reorganizada para separar evolução semanal e cobertura por equipe, eliminando espaços vazios causados pelo Grid.
- KPIs, filtros e cards recebem novos breakpoints e drill-downs para melhorar uso em notebooks e telas intermediárias.

### Performance, atualização e experiência
- Rotas principais são pré-aquecidas após autenticação e a navegação deixa de apresentar tela branca durante carregamento de chunks.
- Correções, Evoluções e Apoios preservam conteúdo durante refresh e tiveram o loop de atualização automática eliminado.
- Nova versão Desktop passa a ser anunciada no topo, com ações para baixar e instalar/reiniciar.
- Runtime Desktop exclui mapas, testes, exemplos, documentação e caches desnecessários do pacote de dependências, reduzindo quantidade de arquivos processados pelo instalador.
- Layout visual revisado em Dashboard, Atenção, Problemas Conhecidos, Investigação, Versões, Azure, Tickets, Minha Operação, Coordenação, Performance, Qualidade, Clientes e Analistas.

### Web e confiabilidade
- Rotas frequentes adicionais são pré-carregadas de forma progressiva para reduzir latência na primeira navegação.
- Redirecionamentos legados preservam query string e hash, evitando perda de deep-links.
- Assets versionados continuam com cache imutável e o shell da SPA permanece sem cache para evitar incompatibilidade entre versões.

> Release Candidate publicada no canal beta para validação final antes da promoção da linha 2.1.


## 2.1.0-rc.1 — 2026-10-03

### Inteligência e automação operacional
- Nova Central de Inteligência com radar de sinais, tendências, anomalias, recorrências e DNA Técnico da operação.
- Motor de correlação cruza Serviço, Cliente e Versão e encaminha os sinais diretamente para a investigação contextual.
- Saúde operacional explicável combina cobertura Azure, classificação, versão, estabilidade e recorrência, mantendo fórmula e componentes visíveis.

### Investigação e Problemas Conhecidos
- Timeline operacional unifica eventos persistidos do Movidesk e Azure DevOps, da abertura do Ticket até a conclusão da Task e versão entregue.
- Problemas Conhecidos passa a sugerir candidatos a partir de recorrências dos últimos 180 dias; a publicação permanece sob revisão humana.
- Busca global inclui a Central de Inteligência e os novos conceitos de recorrência, anomalia, cluster e DNA Técnico.

### SLA × OLA 2.0
- Central da Coordenação formaliza Suporte = abertura do Ticket → abertura da Task e Fábrica = abertura da Task → Task Concluída.
- Cockpit de saúde SLA × OLA apresenta OLA Suporte, OLA Fábrica, SLA Total, qualidade dos vínculos, pesos e alertas de itens abertos acima do limite.
- Mantidas análises por prioridade P1–P4, analista, cliente, tendência mensal, outliers e drill-down.

### Confiabilidade e experiência
- Observabilidade das fontes diferencia problema operacional de dado incompleto, exibindo estado, última sincronização, volume e erros de Movidesk, Azure, catálogo de serviços e CSAT.
- Interfaces novas seguem superfícies responsivas, dark mode, cards compactos, estados explicativos e navegação contextual.
- Corrigidas tipagens estritas do build Docker para clusters e evidências de Problemas Conhecidos.

> Release Candidate destinada à validação funcional da linha 2.1 antes da promoção para versão estável.


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
