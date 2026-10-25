# Auditoria visual transversal — TechLead Hub

Data: 2026-10-24. Escopo: branch `feat/auditoria-visual-estabilidade-rc9`, frontend React/MUI.

## O que foi efetivamente verificado

Inspeção **estática do código** de 32 arquivos em `frontend/src/pages`, do layout autenticado, do tema, dos tokens, dos componentes compartilhados e do resultado da CI. Isso **não equivale** a inspeção renderizada em navegador ou testes E2E com login e dados reais.

| Grupo | Módulos inspecionados | Pontos de atenção |
| --- | --- | --- |
| Indicadores e gráficos | Dashboard, Analysts, Clients, Coordination, DataQuality, Intelligence, Investigation, Performance, Reports, Services, TechnicalLeadership, Versions, AzureWorkItems | Legendas, tooltips, rótulos longos, alturas e cores de séries em claro/escuro |
| Tabelas e listas extensas | Tickets, Clients, Analysts, Attention, AzureWorkItems, Performance, Users, Versions | Rolagem horizontal, colunas de ações, paginação, foco por teclado e textos longos |
| Configuração e formulários | Settings, Import, Profile, Users, Reports, Knowledge | Rótulos, mensagens de validação, estados de salvamento e recuperação |
| Diálogos e painéis | Chat, Investigation, KnownProblems, Users, Tickets, Clients | Largura em telas pequenas, foco, rolagem interna e botões de confirmação |
| Fluxos e módulos especializados | About, AnalysisAssistant, HomeWorkspace, Login, ManagementIntelligence, MyOperation, OperationalOverview, OperationsHub, RiskPendingHub, SimerMap | Estados vazios, cartões próprios e layouts de tela inteira |

## Ajustes transversais aplicados

- Tema MUI: superfícies de cartões, sombras e contraste uniformizados.
- Tokens: paleta e elevação semânticas alinhadas ao Dashboard.
- Tabelas: cabeçalho, densidade, overflow horizontal e adaptação mobile.
- Componentes compartilhados: PageHeader, ChartPanel e ContentState.
- Diálogos: largura e altura máximas em viewport pequena, fundo e texto adaptados ao tema.
- Tipos do Desktop: correção de erro TypeScript pré-existente da importação `.env` (Movidesk).

## Matriz de validação visual pendente (necessita aplicação executando)

Executar em cada módulo relevante:

| Cenário | Viewport | Tema | Verificação |
| --- | --- | --- | --- |
| Notebook | 1366×768 | Claro e escuro | Hierarquia, conteúdo visível, tabelas e botões |
| Monitor | 1920×1080 | Claro e escuro | Uso da largura, espaçamento e gráficos |
| Tablet | 768×1024 | Claro e escuro | Colunas, filtros, menus, tabelas com rolagem |
| Celular | 390×844 | Claro e escuro | Sem overflow da página, modais acessíveis |
| Sem dados | 1366×768 | Ambos | Estados vazios, ações de recuperação |
| Carregando/erro | 1366×768 | Ambos | Skeletons, alertas, contraste, retry |
| Formulários/diálogos | 390×844 | Ambos | Foco, scroll interno, campos, botões e mensagens |
| Acessibilidade | Desktop e mobile | Ambos | Teclado, foco visível, zoom 200%, movimento reduzido |

## Critérios para encerramento

1. `npm --prefix frontend run lint`, `test` e `build` aprovados.
2. Sem erros TypeScript ou falhas de teste de regressão.
3. Capturas reais das rotas representativas em ambos os temas e resoluções.
4. Nenhuma tabela ou modal inacessível; nenhum corte de conteúdo crítico.
5. Gráficos e indicadores existentes preservados, sem cartões duplicados.
6. CI de imagem Docker investigada separadamente do polimento visual.

**Status:** revisão estática concluída; ajustes globais aplicados; validação renderizada e homologação funcional ainda pendentes.
