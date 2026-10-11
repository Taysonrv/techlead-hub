# Padrão dos cards de indicadores

Os indicadores usam o visual do Resumo Executivo do Dashboard por meio de `KpiCard` e `KpiGrid`. Medidas e tipografia ficam centralizadas em `frontend/src/theme/layoutTokens.ts`.

| Elemento | Padrão |
| --- | --- |
| Altura do indicador | 112 px até `sm`; 118 px a partir de `md` |
| Colunas do grid | 1 em `xs`, 2 em `sm`, 3 a partir de `lg` |
| Espaçamento entre cards | 10 px em `xs`, 12 px em `md`, 16 px em `xl` |
| Título | 0,8 rem, uma linha, texto completo no atributo `title` |
| Valor | 1,45 rem em `xs`, 1,62 rem em `md`, 1,72 rem em `xl` |
| Descrição | Até duas linhas, texto completo no atributo `title` |

A mesma base atende Dashboard, Desempenho e SLA, Clientes, Analistas, Tickets, Minha Operação, Pendências e Riscos, Qualidade de Dados, Gestão Executiva, Inteligência, Coordenação, Liderança Técnica, Serviços SIMER, Problemas Conhecidos, Investigação, Correções, Evoluções, Apoios, Versões, Usuários e Integrações. Correções, Evoluções e Apoios compartilham os indicadores de `AzureWorkItems`; o report mensal usa o mesmo padrão.

Cards de gráficos, tabelas, formulários e registros mantêm dimensões adequadas ao conteúdo. `ExecutiveSection` permite que seções vizinhas ocupem a mesma altura de sua linha, sem largura mínima que ultrapasse o container.

## Interações e manutenção

- Use `KpiCard` para um novo indicador e coloque conjuntos de indicadores em `KpiGrid`, evitando alturas, fontes e grids locais.
- `onClick` abre o mesmo detalhamento ou filtro da tela. Enter e Espaço ativam o card quando ele recebe o foco.
- `info`, `metadata` ou `infoContent` mostram as regras e fontes. Interagir com uma informação interna não ativa o detalhamento do card.
- `icon` e `progress` permitem exibir contexto e porcentagens dentro das medidas comuns.
- Cores semânticas, textos de regras, filtros, listas de detalhes e exportações permanecem vinculados aos dados de cada tela.

## Validação

Build TypeScript/Vite e lint com verificação de acessibilidade/CSP. Conferência em navegador dos componentes compartilhados e das páginas Dashboard, Desempenho e SLA e Report mensal de Correções em 1640, 768 e 390 px, nos temas claro e escuro, usando dados de teste. Inclui medidas dos cards, ausência de overflow, navegação por teclado, informação interna e abertura dos drawers. Essa verificação visual não mede a sincronização de dados de produção.
