# Carteira operacional SIMER

As leituras operacionais passam pelos filtros obrigatórios de `OperationalScope.ts`. Um filtro da tela pode reduzir a carteira, mas não ampliá-la. Registros sincronizados permanecem no banco: aplicar o recorte de leitura não altera a ingestão nem apaga histórico.

## Regras

- Movidesk: cliente oficial da carteira, produto SIMER, responsável em `SUPPORT_ANALYSTS`, criado a partir de 01/01/2026 e não excluído. A equipe SIMER sozinha não admite um responsável externo. A contagem administrativa de excluídos conserva a carteira e permite explicitamente registros excluídos.
- Azure: Cliente Principal oficial (ou alias explícito), `Created By` do time (incluindo aliases explícitos) e tipo Correção Clientes, Evolução ou APOIO. Ticket vinculado e Assigned To não ampliam a carteira. Assigned To continua representando o desenvolvimento.
- Report mensal de Correções: mantém seu escopo específico de criadores Alan, Renan e Tayson e carteira oficial. A apuração histórica mantém Tasks anteriores ao mês necessárias ao backlog.
- Coordenação utiliza o mesmo escopo operacional obrigatório.
- Problemas Conhecidos: cliente e vínculos declarados devem estar no escopo. Publicações gerais, sem cliente ou vínculo, continuam sendo conhecimento compartilhado. A validação é aplicada à listagem, fontes, DNA, investigação, notificações e criação/edição; IDs fora da carteira não permitem edição, leitura ou arquivamento.
- Nomes parcialmente semelhantes não são aliases. Campos ausentes não permitem ampliar a carteira.

## Cobertura de leitura

| Telas/recursos | Pontos protegidos |
| --- | --- |
| Dashboard, Clientes, Analistas, Desempenho/SLA, Tickets, Pendências e Riscos | Snapshot, contagens, agregações, CSAT por tickets elegíveis e Azure relacionado |
| Correções, Evoluções, Apoios, Versões | Listagem, resumo, filtros, produtividade, detalhe por ID, pai/filhos e tickets relacionados |
| Minha Operação | Fila, Tasks, últimas versões, detalhe do atendimento e opções de equipe |
| Gestão e Inteligência, Coordenação e Liderança Técnica | Indicadores, correlações, comparações e amostras |
| Relatórios | Filtros, Excel e PDF executivo |
| Serviços SIMER e Qualidade dos Dados | Classificação, vínculos e indicadores de cobertura |
| Problemas Conhecidos | Publicações, contagem de não lidos, sugestões, fontes e DNA técnico |
| Busca global e Investigação | Resultados, comparações entre clientes e acesso por ID |
| Notificações | Tickets, Tasks, versões e publicações elegíveis |
| Dados e Sincronizações | Diagnósticos de dados, cobertura, amostra remota e enriquecimentos exibidos |

Configurações, contas/permissões, calendário, chat e catálogo de mapas/regras são recursos administrativos ou colaborativos sem carteira de tickets própria. Telemetria de execução dos jobs continua descrevendo a execução da integração; não é um indicador da fila operacional.

## Validação

Testes de exclusão para cliente externo/analista interno, cliente interno/analista externo, responsável ausente, produto externo, Task com vínculo Movidesk externo, aliases, filtros OR, Coordenação, publicações e acesso direto por ID. Build e testes locais verificam o código; a conferência dos números da instalação exige o banco real do ambiente.
