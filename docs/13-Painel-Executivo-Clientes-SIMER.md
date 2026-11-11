# Painel Executivo de Clientes — Coordenação SIMER

## Objetivo
Transformar o diagnóstico específico da Bom Jesus em um **painel nativo reutilizável**, permitindo selecionar cada cliente da carteira oficial SIMER, acompanhar indicadores de OLA/SLA e correções, e exportar o relatório para apresentação à Diretoria.

## Critérios de acesso e segurança
- A página utiliza a permissão existente `coordination`; as novas rotas passam pelo mesmo middleware.
- A lista vem de `SIMER_CLIENTS` e da conta condicional `SIAGRI SISTEMAS` (`backend/src/domain/OperationalScope.ts`). O backend valida `resolveExecutiveClient` antes de qualquer consulta. Nomes aproximados ou clientes fora da carteira geram HTTP 400.
- A consulta exige cliente canônico exato (ou prefixo autorizado exclusivo para SIAGRI SISTEMAS) + responsável entre os analistas oficiais do Suporte SIMER + período de abertura + tickets não excluídos.
- Não há seleção livre de clientes externos, tampouco alteração de dados do Movidesk ou Azure na geração.
- A exportação usa o **mesmo objeto** da visualização, evitando divergência de totais.
- A sincronização e o dono do ticket são fotografias atuais; mudanças históricas de responsável exigem consulta específica.

## Rotas
| Método | Endpoint | Utilidade |
|---|---|---|
| GET | `/coordination/client-executive-report/clients` | Nomes canônicos autorizados |
| GET | `/coordination/client-executive-report?client=<nome>&startDate=2026-07-01&endDate=2026-11-11&slaTier=auto` | Relatório com trilhas e indicadores |
| GET | `/coordination/client-executive-report.xlsx?...mesmos parâmetros` | Excel executivo (14 abas) |

As rotas antigas `/bom-jesus-report` e `/bom-jesus-report.xlsx` permanecem para compatibilidade, com seleção fixa da Bom Jesus.

## Painel nativo na Coordenação
- Visual inspirado no Painel Gerencial de Vendas do SIMER (referência enviada pelo usuário): barra de navegação horizontal, indicadores compactos, gráficos em cartões, quatro rankings, relação de tickets e matriz multidimensional.
- Cabeçalho `Painel Gerencial de Atendimento` com botão `Alterar parâmetros`, `Atualizar` e `Excel da Diretoria`.
- Drawer lateral para seleção do cliente autorizado (padrão Bom Jesus), semestre/mês/90 dias/personalizado, datas e perfil de SLA; `Aplicar parâmetros` atualiza o recorte de uma vez.
- **Visão Geral:** seis KPIs, barras horizontais por categoria, rosca de situação das correções, rosca de OLA, linha de evolução mensal e tabelas-resumo por status/serviço.
- **Ranking:** quatro tabelas de participação por analista atual, categoria, situação e rotina; permite trocar a medida entre tickets, Bugs, correções e alertas auditados. Selecionar um grupo abre a Lista filtrada.
- **Lista de Atendimentos:** pesquisa, filtro de categoria, ordenação, paginação e abertura do ticket no HUB. Situação do OLA é cruzada com a auditoria técnica (não usa diretamente o flag bruto para contar canceladas).
- **Multidimensional:** matriz analítica com escolha de linhas, colunas, medida e Top 10/20/todos. Pode cruzar analista, categoria, situação e serviço; mostra Outros e Total Geral.
- **Auditoria SLA / OLA:** preserva os painéis técnicos originais (prazo, qualidade de correções, reclassificações, Vistra e recorrência) e as tabelas legadas em acordeão.
- Tudo respeita o **cliente selecionado** e o intervalo aplicado; nenhuma tabela de outro cliente é exibida enquanto o novo recorte carrega.
- Ranking por analista representa **atribuição atual do ticket**, não pontuação, SLA histórico ou produtividade individual.


## Excel para Diretoria
1. `01 VISAO EXECUTIVA` — capa, 6 indicadores, risco, prazos e plano de ação, A4 paisagem.
2. `02 GRAFICOS` — 4 gráficos de alta resolução, distribuídos em grade 2×2, com título e legenda, A4 paisagem.
3. `03 OLA SUPORTE` — ticket por ticket, metas, excedentes, pausas e evidências em horas úteis.
4. `04 QUALIDADE CORRECOES` — estado Azure, versão, resolução, reabertura e possíveis novas manifestações.
5. `05 CLASSIFICACOES` — matriz atual Bug × Task Azure, com divergências.
6. `06 RECLASSIFICACOES` — observações e candidatos para conferência.
7. `07 VISTRA RELATORIOS` — Vistra, Analítico e relatórios distintos.
8. `08 RECORRENCIAS` — grupos candidatos e respectivas Task/tickets.
9. `09 EVOLUCAO MENSAL` — números e barras de volume editáveis.
10. `10 PLANO DE ACAO` — ações sugeridas; responsáveis e prazos a definir.
11. `11 BASE AUDITAVEL` — dados originais do recorte.
12. `12 CRITERIOS FONTES` — glossário e metodologia.
13. `13 RANKINGS` — quatro rankings formatados: analista, categoria, situação e rotina.
14. `14 MULTIDIMENSIONAL` — matriz de analistas × principais categorias, com Outros e totais completos.

**Nota:** os gráficos do Excel são renderizações PNG de apresentação, não objetos de gráfico nativos editáveis; as séries utilizadas permanecem como dados numéricos nas abas 03, 04 e 09, e podem ser usadas para construir gráficos editáveis no Excel. Não se deve afirmar o contrário.

## Ressalvas obrigatórias de auditoria
- Task aberta é **proxy temporal** de passagem à Fábrica. Não é prova da data oficial de encaminhamento.
- Um alerta de OLA não é descumprimento definitivamente comprovado sem validação de pauses/urgência/contrato/feriados.
- Uma Task concluída com versão cadastrada não comprova implantação, homologação ou aceite do cliente.
- Transições de categoria são observadas entre capturas; a categoria inicial do ticket pode não estar disponível no histórico do HUB.
- Recorrências agrupadas por assunto ou Task podem compartilhar tickets e não comprovam automaticamente mesma causa-raiz.

## Testes recomendados em desenvolvimento
```powershell
cd C:\Users\TAYSON.ARAUJO\Documents\techlead-hub-dashboard-dev
git switch feat/coordination-weekly-workspace
git pull --ff-only origin feat/coordination-weekly-workspace

cd backend
npm run build
npm test

cd ..\frontend
npm run build
npm test
npm run lint
```

Critérios de aceite:
- Cada cliente canônico aparece no seletor; a Bom Jesus conserva seu universo e números se os dados sincronizados não mudaram.
- Cliente fora da carteira retorna 400, sem resultados.
- Os quatro gráficos exibem zeros sem falhar quando o período está vazio.
- Os indicadores de cada cliente acompanham todos os filtros e coincidem com o arquivo exportado.
- O Excel abre sem reparos e a aba `02 GRAFICOS` contém quatro PNGs visíveis; a aba `09 EVOLUCAO MENSAL` fornece a fonte numérica. Conferir também as abas `13 RANKINGS` e `14 MULTIDIMENSIONAL`.
- O backend testa o formato PNG, a integridade do workbook e as regras de auditoria sem precisar consultar APIs reais.

## Homologação do novo modelo visual
- Abrir `Central da Coordenação → Painel Gerencial de Atendimento`.
- Em Visão Geral, verificar 6 indicadores, barras de composição, 2 gráficos de rosca, linha mensal e dois resumos tabulares.
- Em Ranking, alternar medida `Atendimentos` → `Correções` → `Alertas OLA`. Verificar que o ranking por analista corresponde ao `owner` atual, inclusive linha "Não atribuído".
- Clicar em um grupo do ranking: a Lista de Atendimentos deve abrir somente os tickets do grupo; clicar diretamente na aba Lista remove o filtro de drill-down.
- Em Lista, filtrar categoria e assunto, ordenar, paginar e abrir um ticket.
- Em Multidimensional, trocar linhas, colunas e indicador. Confirmar que os totais das categorias e a soma "Outros" preservam o total geral, inclusive ao exibir Top 10.
- Em Alterar parâmetros, cancelar sem aplicar não deve alterar o recorte; aplicar uma escolha autorizada deve atualizar todas as abas e o Excel. Um intervalo inválido de mais de 366 dias deve ser bloqueado.
- Conferir o Excel da Diretoria: visual, gráficos, rankings, matriz multidimensional e trilha auditável devem corresponder ao mesmo recorte.
