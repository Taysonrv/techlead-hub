# Clientes — pacote de evolução para reuniões semanais de Suporte e Sustentação
Atualização: 12/11/2026. Apresentação de referência: cliente Bom Jesus em 13/11/2026.

## Diagnóstico anterior
A tela `Clientes` já oferecia filtro global de períodos, carteira SIMER, indicadores de SLA, gráficos mensais, desenvolvimento Azure e apresentação ao cliente em 5 páginas. O Dashboard utiliza a função compartilhada `buildOperationalCohorts` para distinguir entrada, resolução, fechamento, backlog atual e pendentes abertos no período. A nova evolução conserva esses conceitos, não substitui as telas existentes e acrescenta comparativos e investigação do estoque público.

## Evoluções implementadas
1. Novo card **Resultados mensais e acompanhamento da sustentação**, imediatamente após filtros da tela Clientes, com foco rápido `Preparar reunião Bom Jesus` quando a carteira inteira está selecionada.
2. KPIs mensais: abertos, resolvidos, categoria Bug (atual), pendentes públicos atuais, pendentes públicos abertos no período e SLA de primeira resposta; com comparativo do mesmo recorte de dias do mês anterior, evitando comparar mês incompleto com mês fechado.
3. Indicadores complementares de SLA de solução, resolução no primeiro contato, CSAT positivo (notas 4–5) e reaberturas; indicadores percentuais exibem denominador de medições quando aplicável.
4. Gráfico de linhas com histórico de seis meses para abertos, resolvidos e categoria Bug; séries com seleção individual, Select All, e drill-down.
5. Gráfico de linhas **Pendentes atuais por mês de abertura**: em qual mês foram abertos os tickets que continuam em aberto hoje, explicitamente NÃO representa backlog histórico.
6. Gráfico horizontal de **Pendentes públicos por cliente**, com estados canônicos (New/InAttendance/Stopped) e tipo público 2, alinhado à definição de Pendentes do Dashboard; respeita o cliente selecionado e não revela outros clientes no modo de apresentação individual.
7. Gráfico de rosca **Situação dos pendentes públicos** com percentuais e listas por status.
8. Todos os KPIs e gráficos abrem o drawer existente da tela `Clientes`, com tickets reais que sustentam o resultado. Filtros e seletores dos gráficos são apenas visuais, não alteram os dados de origem.
9. Apresentação para o cliente ampliada para **6 páginas**, com nova página de resultados mensais, indicadores e gráfico de aberturas × resoluções. A página de pendências e o resumo inicial passam a utilizar o backlog público atual, evitando incompatibilidade com o Dashboard e o novo painel.
10. A exportação `Exportar PDF` já existente inclui a página mensal adicional. Não existe nova planilha Excel nessa alteração específica.

## Critérios de contagem
| Indicador | Universo e marco |
|---|---|
| Abertos | Ticket.isWithSimer=true, `createdDate` no mês de referência |
| Resolvidos | `resolvedDate` no mês, inclusive tickets posteriormente reabertos, como Dashboard |
| Fechados | `closedDate` no mês, excluindo cancelados |
| Categoria Bug | Categoria **atual** Bug, abertura no mês; não significa bug tecnicamente confirmado |
| SLA de resposta | `firstResponseDate <= firstResponseDueDate`, somente tickets com os dois campos, agrupados por abertura |
| SLA de solução | `resolvedDate <= dueDate`, somente tickets com os dois marcos, agrupados por resolução |
| Backlog público atual | `ticketType===2` e `baseStatus` em New, InAttendance ou Stopped; inclui todos os meses |
| Pendentes no período | Subconjunto do backlog atual com `createdDate` dentro do período global |
| Pendentes atuais por mês de abertura | Cohorte de backlog atual agrupada pelo mês de criação, não uma fotografia histórica |
| Comparação mensal | Mês de referência até data final efetiva, comparado com o mesmo dia de corte no mês anterior; se mês de referência terminou, ambos meses completos |
| CSAT positivo | Notas 4 ou 5 dentro das avaliações válidas vinculadas aos tickets abertos no mês |
| Primeiro contato | `resolvedInFirstCall` informado nos tickets abertos no mês; indefinidos excluídos do denominador |

O painel usa o snapshot sincronizado, não uma conexão com Movidesk em tempo real. Resoluções e classificações podem mudar após a coleta. **Não existe histórico confiável para comparar estoque de backlog no fim de meses passados**; o novo painel não apresenta essa estimativa como fato.

## Homologação recomendada
- Selecionar Bom Jesus e `Este mês`; conferir os 6 KPIs e os totais dos drilldowns, especialmente pendentes públicos.
- Selecionar `Este semestre`; conferir que comparativos mensais continuam incluindo o mês anterior e que `Pendentes abertos no período` respeita o filtro global.
- Comparar `Backlog atual · SIMER` com `Pendentes públicos atuais` no novo painel; devem coincidir sob os mesmos filtros locais.
- Verificar que um ticket interno (`ticketType=1`) não entra no gráfico de pendências, mas pode aparecer em Abertos.
- Revisar ticket resolvido em novembro, aberto em outubro: conta em `Resolvidos novembro`, não em `Abertos novembro`.
- Verificar ticket reaberto após resolução: evento de resolução continua contabilizado no mês e o ticket pode reaparecer no backlog.
- Desmarcar/remarcar séries, abrir cada categoria/barra/fatia/mês, conferir tickets no Drawer e exportar os registros com o botão já existente.
- Testar `Apresentar em tela cheia` nas 6 páginas e `Exportar PDF`; a página mensal deve aparecer como página 2 sem cortar o gráfico.
- Confirmar que o filtro Bom Jesus não apresenta dados de outras cooperativas no comparativo de pendentes.
- Validar estados sem medição de SLA, CSAT e resolução no primeiro contato (não devem ser tratados como zero).
- Rodar `npm run build && npm test && npm run lint` na pasta `frontend`.

## Teste automatizado
`frontend/tests/clientMeetingAnalytics.test.mjs` valida comparação por mesma data de corte, pendentes públicos, solução de tickets anteriores, reaberturas, fechamento cancelado, cliente selecionado e denominador de SLA.
