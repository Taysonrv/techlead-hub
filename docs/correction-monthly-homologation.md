# Report mensal de Correções — conferência e entrega

O report considera exclusivamente Correções Clientes da carteira SIMER, criadas por Alan, Renan e Tayson. O responsável atual pode pertencer ao desenvolvimento. Os limites de abertura e fechamento usam America/Sao_Paulo. Consultas WIQL ASOF usam timePrecision=true para explicitar a precisão de horário dos cortes, inclusive no teste histórico de Integrações.

A descoberta de IDs consulta o Azure no fechamento, incluindo estados terminais e Registro. Portanto, Tasks ainda ausentes da sincronização local podem participar do relatório. Na abertura, Registro é consultado para reconstrução do pipeline, mas não integra o backlog. O fechamento anterior e a abertura do mês seguinte representam a mesma fotografia.

O Reporting percorre nextLink ou continuationToken até concluir a consulta. Identidades com displayName, uniqueName e nome acompanhado de email são reconhecidas. Snapshots usam até três lotes simultâneos de no máximo 200 IDs por fotografia. Quando faltam estados ou campos customizados, as revisões completas por ID complementam os dados. Uma consulta de abertura malsucedida não descarta um fechamento obtido com sucesso. Recarregar invalida também revisões e descoberta de campos em cache.

Respostas sem a coleção JSON esperada são rejeitadas; HTML ou outro payload inválido não equivale a consulta vazia. Falhas da atualização em segundo plano preservam a última apuração e mostram a causa na tela. Escopo histórico totalmente vazio com Tasks locais no período gera diagnóstico explícito para conferência da organização, projeto e acesso. Esse sinal não identifica sozinho a causa da falha na instalação.

A expiração do cache de dois minutos agenda uma consulta e preserva a última apuração, seus IDs remotos, cobertura e erros. Ela não reconstrói uma prévia local por cima da consulta anterior. Após falha temporária, novas tentativas automáticas respeitam dez minutos. Falhas de autenticação, permissão, redirecionamento, configuração ou resposta inválida pausam as tentativas automáticas. Recarregar permite tentar depois de corrigir a integração, preserva os dados durante a consulta e compartilha uma geração já em andamento. Uma prévia exclusivamente local identifica que seus números não representam cobertura histórica do Azure.

Se a preparação inicial levar mais de quatro segundos depois de autenticar a requisição, a API responde HTTP 202 com o estado de geração, sem cards ou totais. A tela acompanha a mesma geração a cada três segundos e só exibe números quando recebe um relatório. Falhas na preparação local permanecem disponíveis à consulta de acompanhamento; Recarregar permite recuperar após corrigir a causa. Na recarga, os dados já exibidos permanecem visíveis inclusive se a nova requisição falhar.

A primeira prévia não aguarda a gravação do fechamento. Essa gravação acontece no fluxo de background, antes da apuração remota, mantendo a ordem dos fechamentos. A leitura do fechamento salvo e das Tasks começa em paralelo; as leituras locais consultam apenas os campos necessários, sem transportar rawFields de todas as Correções. O terminal registra início da prévia e duração da apuração. Um timeout de 30 segundos no navegador indica que a chamada ao Hub não respondeu; isoladamente, ele não identifica falha do Azure. Se persistir, conferir logs do backend, versão executada, proxy do Vite e acesso ao PostgreSQL/autenticação antes do controller.

Sincronização, report e teste de configuração usam a mesma configuração canônica e os mesmos cabeçalhos de API, incluindo X-TFS-FedAuthRedirect: Suppress. Não seguem redirecionamentos e exigem coleções JSON. HTML com HTTP 200 não comprova conexão e não vira sincronização bem-sucedida com zero itens. O teste de conectividade usa WIQL, sem depender de um ID fixo nem de Wiki configurada. O cliente de sincronização aplica credenciais alteradas na próxima consulta.

URLs copiadas de dev.azure.com ou da organização visualstudio.com são normalizadas para organização e projeto. Mudanças de organização/projeto são validadas antes de salvar, mesmo sem trocar o PAT. O PAT central salvo no Hub prevalece sobre o ambiente do serviço; a tela informa sua origem, sem exibir a credencial. Quando Location identifica uma página Microsoft de login, o diagnóstico classifica autenticação interativa. Um HTTP 302 sem essa evidência continua indicando redirecionamento de causa indeterminada. Corpo, URL de redirecionamento e tokens não são expostos.

Uma recusa na descoberta de campos interrompe as demais consultas históricas. Uma recusa de Reporting/WIQL impede repetir snapshots e recuperação por ID com a mesma credencial recusada. O backend retorna azureConnection.status=blocked com diagnóstico seguro. Falhas temporárias preservam a recuperação parcial independente quando for possível.

Integrações oferece Testar histórico do mês, para a credencial atual ou uma candidata: campos/mapeamento, Reporting, WIQL ASOF e snapshots da abertura/fechamento. Os cortes são idênticos aos do report. O teste é de acesso com amostras, não completa a apuração e não homologa totais; snapshots sem um ID disponível aparecem como não testados. Nenhuma credencial é gravada durante o teste.

A tela prioriza filtros, seis cards, distribuições e detalhamento. A pendência histórica fica em um aviso curto, com diagnóstico recolhido e acesso ao teste de Integrações para administradores. Conferência de setembro fica recolhida após os gráficos. Movimentos sem evidência e sem itens comprovados mostram —, inclusive no resumo Excel da prévia; zero fica reservado a uma apuração comprovada. Não informado na priorização usa a cor de atenção, sem mudar de cor quando outras categorias estiverem vazias. A exportação parcial se identifica como Exportar prévia Excel.

Cliente, urgência e priorização históricos vêm do fechamento. Campos ausentes nunca usam valores atuais; quando não houver evidência, urgência/priorização aparecem como Não informado. A mesma revisão histórica pode complementar campos omitidos pelo batch. A prévia local de mês encerrado também não substitui esses campos pelos valores atuais. Assim, mudanças posteriores não alteram cards filtrados ou distribuições de um mês fechado.

Responsável atual e responsável no fechamento são informações separadas. O atual vem da última sincronização local; para Tasks remotas ainda não sincronizadas, uma consulta batch sem ASOF recupera a atribuição atual. A ausência de atribuição ou uma consulta malsucedida não reutiliza o nome antigo. Essa informação descritiva não filtra os criadores do suporte nem altera a apuração histórica. A lateral e o Excel incluem ambos os responsáveis.

Compartilhar seleção preserva mês, filtros múltiplos, indicador/gráfico e busca textual no link. Compartilhar Task preserva também o ID selecionado. O destinatário abre o mesmo recorte sob as próprias permissões e a carteira obrigatória; o link consulta os dados disponíveis e não congela uma cópia do report. Tabela, lateral, compartilhamento e exportação da lateral usam a mesma busca textual.

## Leitura dos números

“Carteira no fechamento” inclui Tasks antigas, inclusive concluídas e canceladas antes do mês. Pipeline, Urgência e Priorização distribuem essa carteira. “Movimentos e backlog do mês” mostra a união distinta dos seis indicadores e abre seu detalhamento. A soma dos cards não representa esse total: uma Task pode aparecer em mais de um indicador.

Registro não pertence a nenhum backlog. Uma task cancelada que estava em Registro na abertura não reduz o backlog inicial. Portanto, Registradas − Entregues − Canceladas não substitui o cálculo do estoque por snapshot.

## Setembro/2026

| Indicador | Referência da coordenação |
| --- | ---: |
| Backlog inicial | 14 |
| Registradas | 45 |
| Entregues | 41 |
| Canceladas | 8 |
| Em Registro | 1 |
| Backlog atual | Apurar no snapshot final |

As referências devem corresponder aos mesmos criadores e à mesma carteira de clientes. Nunca são usadas para preencher ou ajustar a apuração. O painel indica histórico pendente, outro recorte, divergência ou homologação; a aprovação exige cobertura completa e comparação coincidente. Sem filtros adicionais, a seleção vazia de criadores representa todo o time já exigido pelo backend.

## Validação na instalação

1. Atualizar a branch e gerar os builds do backend e frontend; reiniciar o backend para carregar o novo serviço.
2. Selecionar setembro/2026, manter Time SIMER e remover filtros adicionais de cliente, urgência, status e priorização.
3. Em Configurações / Integrações, conferir a origem do PAT e usar Testar conexão atual. Para HTTP 302 ou login, validar PAT, organização/projeto e políticas de acesso. Usar Testar histórico do mês com 2026-09 e conferir cada resultado. Corrigir falhas antes de recarregar; testes com amostras não homologam números.
4. Voltar a Correções, usar Recarregar e aguardar a conferência do Azure terminar. A prévia responde enquanto o histórico é consultado.
5. Conferir a cobertura de abertura/fechamento e as referências. Se houver divergência, comparar os IDs exportados com o levantamento de origem, incluindo Created By e Cliente Principal. Revisões vazias isoladamente não invalidam snapshots completos com StateChangeDate; consulta ou cobertura incompleta impede aprovação.
6. Conferir que o backlog final de setembro corresponde ao inicial de outubro sob os mesmos filtros.
7. Usar Exportar report Excel. O arquivo traz os seis indicadores, referências, situação da apuração, período, filtros e listagem por ID. Se o histórico for parcial, o arquivo identifica PRÉVIA PARCIAL. Exportações da tabela e das laterais também levam a situação do histórico.

Fechamentos anteriores ao formato v6 são reapurados: além dos antigos filtros históricos com metadados atuais, podiam excluir as grafias Azure `COOPERATIVA BOM JESUS - LAPA-PR` e `COOPERATIVA AGROPECUARIA COMAG`. Essas grafias são aliases exatos dos clientes SIMER existentes, sem ampliar a carteira nem os criadores autorizados. Um fechamento v6 comprovado não é substituído por uma prévia com cobertura inferior. Testes automatizados exercitam dados simulados e não certificam os números da instalação.

## Fontes técnicas

- [Reporting Work Item Revisions](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/reporting-work-item-revisions/read-reporting-revisions-get?view=azure-devops-rest-7.1)
- [Work Items Batch / ASOF](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1)
- [WIQL / precisão de horário](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1)


## Visões e conferência de 12/10/2026

A visão inicial Movimentos e backlog do mês usa a união dos seis indicadores por ID, preservando backlog herdado sem exigir evento no mês. A opção Carteira acumulada no fechamento mantém o pipeline previsto no escopo, incluindo terminais antigos. Gráficos, tabela, detalhamento, exportação e links identificam a visão. Os seis cards continuam com suas regras próprias. Gráficos exigem estado comprovado no fechamento; itens sem esse estado permanecem na listagem.

O último Excel de setembro contém 370 IDs na carteira e 62 nos indicadores, com 44 registradas, 41 entregues, 8 canceladas, 1 em Registro, 14 no backlog inicial e 12 no final. A referência de 45 registradas ainda impede homologação integral. O CSV fornecido contém a Task 27002 (criada em 28/09, conclusão atual em 05/10), ausente do Excel; o Excel contém 26366 e 27079, ausentes do CSV. A união das listas de criação tem 45 IDs. Conferir histórico de tipo, Cliente Principal, criador e estado da 27002 no fechamento antes de concluir a causa ou alterar o backlog. O estado atual não comprova seu estado em setembro.
