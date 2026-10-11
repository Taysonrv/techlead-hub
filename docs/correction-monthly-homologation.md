# Report mensal de Correções — conferência e entrega

O report considera exclusivamente Correções Clientes da carteira SIMER, criadas por Alan, Renan e Tayson. O responsável atual pode pertencer ao desenvolvimento. Os limites de abertura e fechamento usam America/Sao_Paulo.

A descoberta de IDs consulta o Azure no fechamento, incluindo estados terminais e Registro. Portanto, Tasks ainda ausentes da sincronização local podem participar do relatório. Na abertura, Registro é consultado para reconstrução do pipeline, mas não integra o backlog. O fechamento anterior e a abertura do mês seguinte representam a mesma fotografia.

O Reporting percorre nextLink ou continuationToken até concluir a consulta. Identidades com displayName, uniqueName e nome acompanhado de email são reconhecidas. Snapshots usam até três lotes simultâneos de no máximo 200 IDs por fotografia. Quando faltam estados ou campos customizados, as revisões completas por ID complementam os dados. Uma consulta de abertura malsucedida não descarta um fechamento obtido com sucesso. Recarregar invalida também revisões e descoberta de campos em cache.

Respostas sem a coleção JSON esperada são rejeitadas; HTML ou outro payload inválido não equivale a consulta vazia. Falhas da atualização em segundo plano preservam a última apuração e mostram a causa na tela. Escopo histórico totalmente vazio com Tasks locais no período gera diagnóstico explícito para conferência da organização, projeto e acesso. Esse sinal não identifica sozinho a causa da falha na instalação.

A expiração do cache de dois minutos agenda uma consulta e preserva a última apuração, seus IDs remotos, cobertura e erros. Ela não reconstrói uma prévia local por cima da consulta anterior. Após resultado parcial ou falha, novas tentativas automáticas respeitam dez minutos; a tela aberta agenda a próxima consulta e informa o horário da última tentativa. Recarregar permite tentar imediatamente, preserva os dados durante a consulta e compartilha uma geração já em andamento. Uma prévia exclusivamente local identifica que seus números não representam cobertura histórica do Azure.

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
3. Usar Recarregar e aguardar a conferência do Azure terminar. A prévia responde imediatamente enquanto o histórico é consultado.
4. Conferir a cobertura de abertura/fechamento e as referências. Se houver divergência, comparar os IDs exportados com o levantamento de origem, incluindo Created By e Cliente Principal. Revisões vazias isoladamente não invalidam snapshots completos com StateChangeDate; consulta ou cobertura incompleta impede aprovação.
5. Conferir que o backlog final de setembro corresponde ao inicial de outubro sob os mesmos filtros.
6. Usar Exportar report Excel. O arquivo traz os seis indicadores, referências, situação da apuração, período, filtros e listagem por ID. Se o histórico for parcial, o arquivo identifica PRÉVIA PARCIAL. Exportações da tabela e das laterais também levam a situação do histórico.

Fechamentos anteriores ao formato v4 são reapurados. Um fechamento comprovado não é substituído por uma prévia com cobertura inferior. Testes automatizados exercitam dados simulados e não certificam os números da instalação.

## Fontes técnicas

- [Reporting Work Item Revisions](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/reporting-work-item-revisions/read-reporting-revisions-get?view=azure-devops-rest-7.1)
- [Work Items Batch / ASOF](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1)
