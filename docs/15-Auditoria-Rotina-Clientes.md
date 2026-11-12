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
