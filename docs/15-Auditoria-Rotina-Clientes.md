# Revisão integral — rotina Clientes

**Data da revisão:** 12/11/2026  
**Alvo:** `frontend/src/pages/Clients.tsx` e componentes auxiliares de reunião semanal.  
**Escopo:** limpeza de UI repetida, consistência da contagem, fluxo de investigação, seleção de clientes e apresentação de Diretoria.

## Inventário dos achados e soluções

| Diagnóstico | Correção aplicada |
|---|---|
| Painel semanal, quatro cards operacionais, dois gráficos de fluxo mensal, três indicadores de desempenho e resumo executivo apareciam juntos, repetindo totais | Um painel principal de Suporte e Sustentação; detalhes do Dashboard e análises históricas sob `Detalhamento operacional e histórico` |
| Apresentação completa de seis páginas aparecia integralmente no corpo da tela, repetindo cards, insights e gráficos | `Apresentação para o cliente e exportação em PDF` fica recolhida, com ação direta `Abrir apresentação / PDF` no painel semanal |
| Implementação separada e volumosa dos gráficos de rosca, de suas legendas e tooltips antigos | Substituída pelos componentes compartilhados `SelectableDonut`/`SelectableHorizontalBars`, com percentuais, selecionar/desmarcar todos e drill-down |
| Dois gráficos de abertura/resolução dos mesmos meses, um no painel semanal e outro na visão operacional | Gráfico mensal duplicado removido; mantido o histórico por categoria e o gráfico distinto de performance SLA na seção detalhada |
| Clientes sem abertura recente não apareciam como opção, mesmo com backlog antigo | Seletor agora é obtido de todos os tickets `isWithSimer=true` disponíveis no snapshot, e não apenas dos abertos no período |
| Composição de status não cobria cancelados/não padronizados, logo as fatias não somavam o universo de tickets | Incluída categoria `Outras situações`, com lista exata de atendimentos |
| Os gráficos antigos usavam fallback que restaurava fatias ocultadas, e legendas de impressão pareciam filtráveis mas não alteravam a pizza | Gráficos ao vivo substituídos por controles compartilhados; a legenda de PDF virou resumo estático e fiel aos valores |
| Histórico de SLA mensal comparava mês atual parcial com mês anterior fechado | Mês anterior usa mesmo dia de corte quando a referência é parcial; casos sem medição não entram no denominador |
| Métrica de SLA solução em Clientes excluía atendimento reaberto após resolução, enquanto Dashboard considerava o evento | Ajustada ao marco de `resolvedDate`, inclusive atendimentos posteriormente reabertos, preservando a definição de coorte |
| Tempo médio de solução da apresentação vinha de tickets **abertos** no período, mas era apresentado junto com o SLA dos **resolvidos** no período | Calculado sobre `solutionScopedTickets` com tempo mensurável, mostrando o denominador |
| Contagem de pendentes da conclusão impressa referia-se aos abertos no período, enquanto gráfico e KPI mostravam backlog público atual | Apresentação e PDF padronizados para `meetingAnalytics.pendingNow`; pendentes de períodos anteriores não são esquecidos |
| Painel de cliente específico tinha gráfico por cliente com uma barra só | Em cliente selecionado, barras mostram pendências por responsável; na carteira total, por cliente |
| Faltava leitura da antiguidade do estoque atual | Adicionado gráfico de 7 dias, 8–30, 31–90 e mais de 90 dias, sem confundir idade de ticket com OLA/SLA |
| Segmentos agrupados em `Outros` na composição por cliente/categoria/responsável não permitiam investigar todos os registros | Gráficos complementares exibem todos os grupos reais sem `Outros` artificial, e cada um abre os tickets |
| PDF dentro de acordeão tinha risco de desaparecer ou não quebrar em páginas ao imprimir | Estilos de impressão delimitam a apresentação, tornam seu conteúdo visível e permitem quebra entre as seis páginas |

## Estrutura final

1. Cabeçalho e filtros locais da carteira, com período global.
2. **Resultados mensais e acompanhamento da sustentação**: seis KPIs, SLA/CSAT/reabertura, tendências, pendências por cliente ou responsável, status e antiguidade; todos investigáveis por Drawer.
3. **Detalhamento operacional e histórico** (recolhido): coortes do Dashboard, tendência por categoria, riscos, desempenho histórico de SLA e resumo técnico.
4. **Apresentação para o cliente e exportação em PDF** (recolhida, com atalho no card principal): seis páginas dedicadas à apresentação.
5. **Distribuições complementares da carteira** (recolhida): cliente, categoria, situação e responsável, com controle independente de fatias e drill-down.
6. Tabela da carteira de clientes e Drawer de atendimento original.

## Regras que permanecem distintas

- **Abertos no período:** abertura dentro do filtro, inclusive ticket já encerrado.
- **Resolvidos no período:** data de resolução, inclusive ticket aberto em mês anterior ou posteriormente reaberto.
- **Backlog público atual:** `ticketType=2` com `baseStatus` New, InAttendance ou Stopped, independentemente da data de abertura.
- **Pendentes abertos no período:** interseção do backlog público atual com a abertura dentro do intervalo.
- **Antiguidade:** dias decorridos desde a abertura até a referência atual, não descumprimento contratual.
- **Categoria Bug:** classificação atual de suporte, não evidência de causa-raiz confirmada pelo Produto.
- **SLA 1ª resposta / solução:** cumprimento de timestamp somente quando data devida e data realizada existem; respeitam eventos distintos.
- **Taxa de resolução da coorte:** percentual dos tickets abertos no mês que estão atualmente resolvidos/fechados; não equivale à fotografia histórica de encerramento daquele mês.

## Testes de regressão adicionados

- `frontend/tests/clientMeetingAnalytics.test.mjs`: coortes, SLA, backlog público, data de corte, reaberturas, cancelamentos, agrupamento por responsável e antiguidade.
- `frontend/tests/clientsExecutiveLayout.test.mjs`: bloqueia reaparecimento do gráfico mensal duplicado, garante apresentação em seis páginas, seletor histórico, backlog da apresentação e menus recolhíveis.

## Homologação manual (necessária antes da reunião)

1. Testar `npm run build`, `npm test`, `npm run lint` no frontend da branch.
2. Selecionar **Bom Jesus** no filtro; validar os indicadores do recorte com Movidesk/Dashboard.
3. Abrir um gráfico de pendentes; comparar total com Drawer; conferir lista dos responsáveis e antiguidade.
4. Alternar `Este mês` / `Este semestre`: os indicadores mensais devem continuar referenciando o mês mais recente, e o card `Pendentes abertos no filtro` muda conforme o período.
5. Abrir **Detalhamento operacional** e **Distribuições complementares**: verificar filtros reversíveis e ausência de gráfico de movimento duplicado.
6. Abrir a apresentação pelo atalho; testar 6 páginas no fullscreen, e o PDF deve conter somente as páginas da apresentação sem cards operacionais externos nem cortes indevidos.
7. Conferir título e marcos de cada indicador, especialmente SLA solução, CSAT, Bug e estoque de backlog.
8. Comparar cliente único vs. carteira inteira para garantir isolamento e ausência de vazamento de dados entre cooperativas.

## Limitações que não foram ocultadas

O HUB lê um **snapshot sincronizado** do Movidesk/Azure, não uma fotografia histórica completa de backlog ou estados de categoria. Não se deve inferir `backlog ao final de outubro` com o status atual; a tendência mensal de pendentes identifica o mês de abertura de tickets **ainda** ativos. SLAs derivados de timestamps podem não refletir pausas contratuais. Não houve validação de build/lint ou renderização do PDF no ambiente local nesta revisão: esses passos devem ser executados na homologação.

## Arquivos alterados

- `frontend/src/pages/Clients.tsx`
- `frontend/src/components/ClientMeetingInsights.tsx`
- `frontend/src/utils/clientMeetingAnalytics.ts`
- `frontend/tests/clientMeetingAnalytics.test.mjs`
- `frontend/tests/clientsExecutiveLayout.test.mjs`

## Correção adicional de classificação
A função local `isBug` incluía como "Bug" qualquer ticket com Task Azure de `Correção Clientes` ou rótulo genérico de "erro de sistema". Essa inferência misturava categorias, tarefas e confirmação técnica. A função agora contabiliza **apenas `ticket.category === "Bug"` após normalização**. Tarefas de correção continuam aparecendo nos indicadores próprios de desenvolvimento e não significam confirmação de causa-raiz.

## Ajustes finais da revisão
- O gráfico de **pendentes atuais** mostra a carteira por cliente quando nenhum está selecionado; ao escolher apenas a Bom Jesus, mostra **por responsável atual**, evitando o gráfico trivial de uma barra.
- Foi criado um comparativo adicional de **antiguidade** dos tickets públicos ainda pendentes. A referência de idade é a data do snapshot atual, não a data de um filtro histórico.
- A composição das situações soma **100% das aberturas no recorte**: estados fora de Novo/Em Atendimento/Parado/Resolvido entram em `Outras situações`, com os tickets correspondentes acessíveis.
- Na apresentação, **tempo médio de solução** passou a representar tickets efetivamente resolvidos no período e com tempo medido; o denominador aparece ao lado. Isso evita a comparação equivocada com tickets apenas abertos no período.
- A conclusão do PDF passou a usar **backlog público atual**, enquanto os indicadores de Bug e Task permanecem qualificados como categoria e vínculo técnico, respectivamente.
- O comportamento de desmarcar todas as séries de tendência foi permitido também nos gráficos históricos.
- A revisão reduziu a página `Clients.tsx` de cerca de **4.539 para 3.666 linhas**, com retirada de lógica/markup duplicados de gráficos e componentes legados, sem remover o Drawer e a tabela da carteira.
- Os testes de regressão agora também cobrem a idade do backlog quando o relatório está filtrado em mês anterior.

**Atenção:** as provas automáticas da branch foram adicionadas, mas sua execução ainda é necessária no frontend local. Além do build, é fundamental validar o PDF impresso, porque sua paginação depende do navegador e dos estilos de impressão.

## Refinamento dos filtros e indicadores de qualidade — 12/11/2026

### Interface
- Removido da rota **Clientes** o componente `PublicClientEnrichment`, identificado pelo título **Consulta cadastral pública**. Seu código permanece no componente compartilhado para não prejudicar outros locais que eventualmente o utilizem.
- Seletor de **Cliente da carteira SIMER** substituído por Autocomplete pesquisável e com limpeza individual, incluindo escolha de toda a carteira.
- Os filtros **Categoria, Status, Responsável, Área de negócio e Frente de atendimento** ficam recolhidos por padrão em **Mais filtros**. Ativos ocultos são indicados por quantidade e chips removíveis individualmente. **Limpar tudo** preserva a função de limpeza original; **Limpar filtros adicionais** mantém o cliente selecionado.
- Métricas secundárias de **SLA de solução, resolução no primeiro contato, CSAT e reaberturas** foram promovidas de chips para quatro cards do mesmo padrão dos seis indicadores superiores, com contexto de medição e abertura dos tickets por clique.

### Diagnóstico técnico das métricas que apareciam zeradas

**Primeiro contato (0% / 35 medidos no exemplo visual)**
- Origem comprovada no código: `MovideskJsonImportService.ts` importa `resolvedInFirstCall` quando a API devolve boolean, e `DashboardController.ts` expõe esse campo no snapshot da tela Clientes.
- Erro na apresentação anterior: `clientMeetingAnalytics.ts` tratava como mensuráveis **todos os abertos no mês** com boolean, incluindo tickets pendentes, ainda sem resolução. O valor false pode estar presente mesmo nos registros não elegíveis.
- Correção: elegibilidade agora usa **tickets com evento `resolvedDate` no mês**, e apenas flag booleana explícita compõe o denominador. O card informa quantos tiveram marcação `true` e quantos tinham informação disponível. Se todos forem false, o sistema exibe 0% como informação **retornada pela origem**, com alerta para revisar preenchimento no Movidesk; não inventa resoluções no primeiro contato.

**CSAT (sem medição / 0 avaliações no exemplo visual)**
- Origem comprovada no código: o snapshot `/dashboard/tickets` faz join de `MovideskSurveyResponse` por `ticketId=movideskId` e `type=2`, preenchendo `satisfactionScore` e `satisfactionDate`. O processo `MovideskSurveySyncService.syncResponses()` busca dados em `/survey/responses` separadamente da importação de tickets.
- Inconsistência corrigida: o cálculo anterior procurava satisfação nos tickets **abertos no mês**, embora uma pesquisa possa ser respondida em data posterior à abertura. Agora o período é determinado por `satisfactionDate`. Somente valores entre **1 e 5** entram no cálculo; avaliações **4–5** são positivas.
- Se não houver respostas válidas neste mês, exibe **Sem avaliações** e informa quantas existem em outros meses da carteira sincronizada, quando disponíveis. O sistema **não apresenta 0% de satisfação sem avaliações**.
- **Limitação de diagnóstico:** código prova de onde vêm as pesquisas, mas sem acesso ao banco não é possível confirmar se 0 respostas decorre de ausência de avaliações reais, sincronização não executada, falha do endpoint `/survey/responses`, filtro `type=2`, ou falta de vínculo com os tickets. A próxima inspeção operacional deve olhar a execução `MovideskSurveySyncService`, a tabela `MovideskSurveyResponse` e os IDs da Bom Jesus.

**Reaberturas (0 no exemplo visual)**
- Problema no frontend: o cálculo utilizava `reopenCount`, campo não incluído no retorno `/dashboard/tickets`; `reopenedDate` **já estava disponível**.
- Correção: card **Tickets reabertos no mês** usa o evento `reopenedDate`. O indicador contabiliza tickets com registro de reabertura naquele mês; não representa a soma histórica de todas as reaberturas.

### Critérios de homologação adicionais
1. Confirmar que `Consulta cadastral pública` não aparece mais no painel Clientes.
2. Buscar **Bom Jesus** digitando uma parte do nome; trocar para outro cliente e para toda a carteira.
3. Abrir **Mais filtros**, aplicar critérios, recolher e confirmar que os chips continuam visíveis e removíveis; depois limpar apenas filtros adicionais sem retirar o cliente.
4. Conferir que os quatro novos cards têm o mesmo padrão dos cards principais e abrem as listas corretas.
5. Para primeiro contato, conferir especificamente flags `resolvedInFirstCall` e `resolvedDate` de alguns atendimentos: não resolvidos não entram no denominador.
6. Para CSAT, conferir respostas da tabela `MovideskSurveyResponse` com `type=2`, `responseDate`, `value` e `ticketId`. Uma resposta recebida em novembro para ticket aberto em outubro deve entrar em novembro.
7. Para reaberturas, conferir `reopenedDate` nos tickets exibidos e o período da referência.
8. Validar `npm run build && npm test && npm run lint` no frontend local e revisar a apresentação/PDF da Bom Jesus.

**Regressões adicionadas:** `frontend/tests/clientMeetingAnalytics.test.mjs` e `frontend/tests/clientsExecutiveLayout.test.mjs` agora cobrem os três indicadores, a ausência do card removido, a busca de cliente, os filtros recolhidos e os KPIs visuais.

## Padronização da interface executiva — 12/11/2026

### Filtros alinhados
- O `PeriodFilter` existente foi removido **somente** do slot `PageHeader.action` da página Clientes e reposicionado ao lado do Autocomplete de Cliente na barra imediatamente abaixo do cabeçalho.
- A barra usa grade responsiva (1 coluna mobile, 2 em médio, 3 em desktop largo), sem duplicar o `PeriodFilter`. O filtro continua conectado ao `FiltersContext`, inclusive para datas personalizadas.
- O seletor de Cliente recebeu largura máxima de 620 px, altura e borda compatíveis com o controle global de período e rótulo acessível `clients-client-selector`. O helper text extenso saiu da área do campo, substituído por explicação discreta abaixo dos filtros.
- `Mais filtros`, indicador de filtros ativos, `Limpar tudo`, chips removíveis e demais controles permanecem operacionais.

### Indicadores visuais
- A implementação customizada de `Kpi` no componente `ClientMeetingInsights` passou a encapsular o **mesmo `KpiCard`** do Dashboard, sem criar outro componente de layout independente.
- Os dez indicadores do painel semanal agora têm a mesma borda, degradê, barra semântica lateral, tipografia, comportamento de hover/foco, estrela de favorito e botão **Informações (i)** do Dashboard.
- `KPI_EXPLANATIONS` fornece definição de cada métrica para o tooltip, com origem Movidesk e regra de período. A abertura do Drawer por clique no card foi preservada.
- Os cards de SLA de primeira resposta e de solução utilizam **exatamente** a régua visual do Dashboard: 90%+ verde; 80% a 89,9% amarelo; abaixo de 80% vermelho; sem medição não sinaliza infração.
- Os blocos utilizam grid responsivo de três colunas para os seis KPIs principais e quatro para os indicadores de qualidade, com duas/uma coluna(s) em telas pequenas.
- Indicadores CSAT sem respostas válidas exibem `N/D` com descrição `Sem avaliações` no card e explicação no tooltip, para evitar corte visual de texto longo.
- Cards da apresentação também recebem tooltip de informação, mas os gráficos e as caixas de apoio do PDF continuam não interativos.

### Homologação
1. Em Clientes, selecionar Bom Jesus e verificar que o campo Cliente e o Período estão na mesma barra, fora do cabeçalho.
2. Alternar `Este mês`, `Este semestre` e `Personalizado`. Conferir quebra responsiva sem sobreposição com Mais filtros.
3. Passar mouse/foco no `i` de cada KPI e conferir a regra de cálculo sem abrir o Drawer.
4. Favoritar e desfavoritar um card e conferir que a ação não abre os tickets.
5. Clicar no corpo dos KPIs e verificar abertura do Drawer com o universo correto.
6. Comparar cores dos SLAs com Dashboard no mesmo recorte: verde 90%+, amarelo 80–89,9%, vermelho abaixo de 80%.
7. Validar `npm run build`, `npm test` e `npm run lint` no frontend; nenhum build remoto foi executado nesta revisão.

**Arquivos desta evolução:** `frontend/src/pages/Clients.tsx`, `frontend/src/components/ClientMeetingInsights.tsx`, `frontend/tests/clientsExecutiveLayout.test.mjs`. `PeriodFilter.tsx` e `KpiCard.tsx` foram reutilizados sem alterar seu comportamento nas outras telas.
