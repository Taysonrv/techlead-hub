# Auditoria das regras do Dashboard para conciliação com o Movidesk

**Preparado em:** 28/10/2026

**Objetivo:** registrar como o Hub calcula cada indicador do Dashboard e destacar decisões que precisam de validação da Coordenação antes de corrigirmos diferenças de quantidade.

> Este material é uma leitura do código atual. Não é ainda uma conciliação numérica com o Movidesk; para isso precisamos comparar exportações com o mesmo período, escopo e horário de referência.

## 1. Como o Dashboard recebe e conta os dados

- O Dashboard carrega `GET /api/dashboard/tickets` e calcula os cards no frontend. Ele **não consome** `GET /api/dashboard/summary` para mostrar os números principais. Há, portanto, duas implementações de resumo que podem divergir ao longo do tempo.
- O endpoint do Dashboard consulta os tickets salvos no banco, exclui registros marcados como removidos e aplica o escopo `movideskDashboardScope`. Não seleciona o último lote de importação: cada número Movidesk corresponde a um registro atualizado por importações posteriores, e a consulta reúne os registros que atendem ao escopo.
- O escopo atual inclui os clientes canônicos da carteira SIMER e tickets cujo responsável atual é um dos sete analistas listados no código. Para clientes SIMER, também admite o responsável especial `SUPORTE SIMER | BDS`. Inclui ainda clientes cujo nome começa por `SIAGRI SISTEMAS`, quando o responsável é um dos sete analistas.
- A consulta ampla do Dashboard não aplica a data operacional mínima de 01/01/2026 nem as exclusões de produtos/serviços usadas em outras telas. Aliases de clientes não são aplicados diretamente nessa consulta; os nomes canônicos precisam estar gravados no ticket.
- A regra de escopo usa o **responsável atual**. Assim, um ticket antigo que mudou de responsável pode entrar ou sair dos indicadores históricos, mesmo que sua abertura ou resolução tenha ocorrido quando estava com outra equipe.
- O filtro global inicia em **Este mês** e é aplicado às métricas de fluxo e aos gráficos dependentes do período. Os cards de backlog atual e críticos/parados representam posição atual e não variam com a data global. Os gráficos de backlog e de agentes ainda têm seletor próprio, que pode substituir o período global.
- O período é tratado como dias locais no navegador (início do primeiro dia e fim do último dia); a API de resumo usa início inclusivo e fim exclusivo. As exportações precisam usar o mesmo fuso e limites de data para evitar diferenças na virada do dia.
- O Dashboard mostra o horário da leitura do cache. A base é atualizada pela sincronização/importação do Movidesk; a comparação deve usar o horário da leitura e a última sincronização, não apenas o dia do calendário.

### Escopo codificado atualmente

**Clientes SIMER canônicos:** Bom Jesus, CAMP, COAGRO, COAP, COOAZUL, COMAG e COPERAMA.

**Responsáveis analistas:** Alan Kardek, Débora Dal, Diego Oliveira, Luiz Antônio, Renan Breno, Tayson Alves e Thiago de Lima.
**Exceções:** `SUPORTE SIMER | BDS` para os clientes SIMER canônicos; clientes iniciados por `SIAGRI SISTEMAS` somente com um dos sete analistas.

## 2. Indicadores essenciais

| Card | Regra efetiva no código | Período/escopo | Ponto para validação |
|---|---|---|---|
| **Abertos no Período** | Conta um ticket por registro com `createdDate` dentro do período. Não exige que o ticket esteja aberto hoje. | Período global; responsável/cliente conforme escopo atual do Dashboard. | Confirmar se o relatório do Movidesk usa a mesma data local e se considera a carteira pelo responsável atual ou pelo responsável na abertura. |
| **Backlog atual** | Conta `baseStatus` igual a `New`, `InAttendance` ou `Stopped`. | Posição atual; ignora o período global. | Comparar com a exportação de pendentes no mesmo instante e confirmar quais status do Movidesk entram no estoque. Status ausente/desconhecido não entra. |
| **Resolvidos** | Conta tickets com `resolvedDate` dentro do período. A regra efetiva não exige status atual Resolvido/Fechado. | Período pela data de resolução; escopo atual do Dashboard. | A descrição do card diz “resolvido ou fechado”, mas a implementação conta pela data `resolvedDate` sem checar status. Validar se isso representa a definição oficial e como reaberturas entram. |
| **Fechados** | Conta tickets com `closedDate` dentro do período, excluindo registros cancelados (`Canceled`, status com “cancel” ou `canceledDate` preenchido). Não exige status atual Fechado. | Período pela data de fechamento; escopo atual do Dashboard. | Regra alinhada à orientação da coordenação; ainda comparar com a exportação Movidesk para confirmar se `closedDate` equivale ao filtro “Fechado em” e como reaberturas afetam o relatório. |
| **SLA 1ª Resposta** | Compara `firstResponseDate <= firstResponseDueDate`; percentual = respostas dentro do prazo ÷ tickets medidos. | Tickets abertos no período global. Registros sem prazo ou sem primeira resposta ficam sem medição e fora do denominador. | Não é o indicador SLA pronto do Movidesk: é cálculo do Hub por timestamps, sem calendário de expediente/pausas. Tickets ainda sem resposta não são classificados como fora do prazo; isso pode elevar o percentual. |
| **SLA Solução** | Compara `resolvedDate` (ou, se não houver, `closedDate`) com `dueDate`; percentual dentro do prazo ÷ medidos. | A coorte é definida por `resolvedDate` no período, incluindo tickets abertos antes. | Como a coorte exige `resolvedDate`, tickets apenas fechados sem data de resolução não entram. Validar prazo, calendário útil, pausas e se o SLA oficial usa data de solução ou fechamento. |
| **CSAT** | Percentual de notas numéricas `>= 4` sobre todas as notas numéricas vinculadas aos tickets. A contagem exibida é de tickets com nota. | Tickets abertos no período global e no escopo atual; não usa a data da resposta para filtrar o card. O backend associa a resposta mais recente do tipo `2` por ticket. | Confirmar tipo de pesquisa, escala considerada válida e se o período oficial deve ser pela abertura ou pela resposta da pesquisa. Comentário sem nota não entra neste KPI. |
| **Críticos** | Tickets atualmente pendentes com urgência normalizada igual a `Crítica`. | Posição atual; ignora o período global. | Confirmar equivalência entre a urgência Movidesk “Crítica” e a severidade desejada para este card. |
| **Parados** | Tickets atualmente pendentes com `baseStatus = Stopped`. | Posição atual; ignora o período global. | Validar o mapeamento do status-base e se “parado” deve incluir outros estados de espera. |

## 3. Gráficos e outros cards

### Tickets pendentes · Backlog

- O total “Backlog atual” usa os três `baseStatus` abertos acima.
- Para hoje, as barras usam a posição atual sincronizada.
- Para datas passadas, o Hub **estima** o estoque: usa abertura/reabertura e datas de resolução, fechamento ou cancelamento. Não há snapshot diário de status que comprove a quantidade histórica.
- Em tickets reabertos mais de uma vez, o registro atual não representa necessariamente todos os ciclos. Por isso a série histórica não deve ser apresentada como contagem oficial do Movidesk nem usada para conciliação de dias passados.

### Indicador de resolução por agente

- As séries Resolvidos e Fechados usam, respectivamente, `resolvedDate` e `closedDate` no período do seletor.
- A série Avaliados considera uma avaliação quando existe nota, data de resposta ou comentário; a data para o filtro é `satisfactionDate`, com fallback para `closedDate` e depois `resolvedDate`.
- Atribui os volumes ao **responsável atual do ticket**, não necessariamente à pessoa que resolveu, fechou ou respondeu à pesquisa. Um mesmo ticket pode contar nas séries Resolvidos e Fechados; elas não são parcelas exclusivas de um total.
- O conceito de “avaliado” difere do KPI CSAT: o gráfico aceita comentário/data sem nota, enquanto o KPI CSAT exige uma nota numérica. A data de período também pode ser diferente.

### Abertos × Resolvidos × Fechados

Mostra o fluxo diário por `createdDate`, `resolvedDate` e `closedDate`, respectivamente. Um mesmo ticket pode aparecer em dias diferentes e em mais de uma série; somar as séries não produz quantidade de tickets únicos.

Para Abertos, Resolvidos e Fechados, o Hub conta registros/IDs de ticket usando as datas disponíveis no registro atual, não cada evento individual de um histórico de transições. Em casos de reabertura e resolução repetida, isso pode divergir de relatórios Movidesk que contem eventos.

### Distribuições operacionais

Categorias, causas/motivos, área de negócio, serviço e análises de aging partem do conjunto de tickets **abertos no período** dentro do escopo do Dashboard. Os gráficos de status filtram esse mesmo conjunto pela situação **atual** aberta. Portanto, não representam todo o backlog atual: tickets abertos antes do início do período ficam fora dessas distribuições, ainda que continuem pendentes.

### Indicadores Azure vinculados

Correções, Evoluções, Priorizadas, Bloqueadas, Sem responsável e Alta/Crítica contam Work Items Azure distintos ligados aos tickets abertos no período global. Os atributos são o estado atual do Azure; não são contagens de tickets Movidesk nem histórico do estado no período.

## 4. Diferenças de implementação que podem confundir a comparação

1. **Resumo duplicado:** a tela usa cálculos do endpoint `/dashboard/tickets`; existe também `/dashboard/summary`, com consultas próprias. A conciliação da Coordenação deve usar o valor visível na tela e a sua lista detalhada, não assumir que os dois endpoints são intercambiáveis.
2. **Escopos diferentes entre telas:** `/dashboard/tickets` usa a carteira ampla descrita acima. `/dashboard/pending-tickets` usa o escopo operacional estrito: abertura a partir de 01/01/2026, cliente SIMER, responsável analista e serviços SIMER, excluindo produtos/serviços específicos. Comparar o card do Dashboard com essa outra rota pode dar diferença legítima de universo.
3. **Responsável atual aplicado a eventos históricos:** abertura, resolução e fechamento no período continuam sujeitos ao responsável atual do ticket. Isso pode omitir chamados transferidos para fora da carteira ou incluir chamados transferidos para dentro dela.
4. **Informação do card Resolvidos:** texto de explicação cita status resolvido/fechado, mas o cálculo considera apenas `resolvedDate` no período.
5. **SLA não equivale ao SLA oficial:** cálculo por timestamps do Hub, regras de calendário ausentes e tickets sem conclusão excluídos do denominador.
6. **CSAT e agente usam conceitos distintos:** KPI conta notas; gráfico aceita nota, comentário ou data e atribui pelo responsável atual.
7. **Backlog histórico estimado:** valores passados são reconstruções; para validação histórica é necessário relatório/snapshot do Movidesk naquela data.

## 5. Retorno da Coordenação e regras acordadas

- **Universo de análise:** não haverá um único universo para todas as perguntas. Precisamos oferecer recortes selecionáveis: operação semanal das equipes Suporte SIMER; equipes de sustentação de produtos integrados (ex.: Hendow, Vistra e Aliare Integra); cliente em todos os produtos (caso recorrente: Bom Jesus); e natureza pública/interna conforme a finalidade.
- **Natureza dos registros:** indicadores operacionais (SLA, abertura, fechamento e backlog) consideram tickets públicos. Medidas de efetividade podem incluir registros internos, com filtro por agente. É necessário confirmar no payload Movidesk se “público/interno” qualifica cada ação/interação ou o ticket inteiro; hoje o banco persiste as ações e o payload bruto, mas não tem um campo normalizado para essa seleção.
- **Pertencimento à carteira:** usar o responsável atual para as análises operacionais usuais. Desempenho por agente deve ser atribuído a quem executou cada evento, e não ao responsável atual do ticket.
- **Abertos no período:** usar a data “Aberto em”/createdDate sem restringir pelo status atual. Para cancelados, reproduzir o que o filtro nativo “Aberto em” do Movidesk inclui.
- **Resolvidos:** reproduzir o comportamento do relatório/painel Movidesk, inclusive em reaberturas e resoluções repetidas; a regra exata ainda depende de exportações de referência.
- **Fechados:** usar “Fechado em”/closedDate quando equivalentes e excluir cancelados. Essa exclusão já foi aplicada ao cálculo principal e ao resumo duplicado do backend.
- **Backlog:** posição pendente; excluir resolvidos, fechados e cancelados. O histórico deve ser reconstruído com o histórico de status, incluindo reaberturas, depois de confirmar que os eventos sincronizados cobrem o período.
- **SLA:** adotar o resultado oficial do Movidesk como referência e usar o PSG para investigar divergências. A implementação atual do Dashboard calcula por timestamps e ainda não equivale ao indicador oficial.
- **CSAT:** reproduzir a inclusão, a data de atribuição e a escala usadas nos painéis de CSAT do Movidesk; ainda precisa de comparação de exportação.

### Itens ainda necessários para fechar a conciliação

- [ ] Exportar do Movidesk os mesmos períodos e perfis, com filtro por equipe, cliente, ticket público/interno e agente executor; registrar data/hora, fuso e filtros.
- [ ] Validar como o Movidesk classifica tickets cancelados no filtro “Aberto em” e se closedDate é o mesmo campo de “Fechado em”.
- [ ] Comparar IDs e eventos dos relatórios “Resolvidos” para estabelecer regras de reabertura e resolução repetida.
- [ ] Comparar SLA e CSAT com seus painéis oficiais, incluindo denominadores, itens sem medição e datas de referência; usar PSG na análise de SLA.
- [ ] Conferir a cobertura temporal das tabelas MovideskStatusHistory e MovideskTicketAction para garantir reconstrução histórica e atribuição ao executor.

## 6. Protocolo recomendado para a conciliação numérica

1. Registrar data/hora da consulta e fuso, período de início/fim e filtros do Movidesk.
2. Exportar as listas detalhadas de Abertos, Backlog, Resolvidos e Fechados, com ID do ticket, cliente, responsável, status/base status, urgência e datas correspondentes.
3. Conciliar primeiro pelo ID único Movidesk; separar IDs somente no Hub, somente no Movidesk e comuns com campos divergentes.
4. Validar separadamente o universo do escopo (cliente, responsável, serviço e exclusões) antes de comparar totais.
5. Para SLA/CSAT, comparar também denominador e registros sem medição, não apenas a porcentagem.
6. A Coordenação aprova a regra desejada; depois corrigimos a implementação e repetimos a comparação no mesmo período/exportação.

## Arquivos e regras consultados

- `frontend/src/pages/Dashboard.tsx` e `frontend/src/components/TeamDashboardCards.tsx`
- `frontend/src/utils/operationalMetrics.ts` e `frontend/src/utils/timestampSla.ts`
- `frontend/src/services/ticketSnapshot.ts`
- `backend/src/controllers/DashboardController.ts`
- `backend/src/domain/OperationalScope.ts`
