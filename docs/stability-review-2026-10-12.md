# Revisão de estabilidade e Dashboard — 12/10/2026

Correções: metadados Movidesk cedem a API entre tickets e antes de retentativas; consulta individual limitada a 20s, mantendo rate limiter. Checkpoint persistido por integração só confirma IDs após leitura e eventual atualização bem-sucedidas. Retomada de passagem por até 24h e intervalo de seis horas após conclusão. Candidatos respeitam cliente, produto e analista do escopo operacional. Payloads sem alterações não regravam tickets.

P2024 e P2028 especificamente por falha ao iniciar transação passam a acionar a pausa dos jobs; outros erros de transação não são tratados como indisponibilidade. Isso não demonstra nem resolve por si só a causa de falhas de rede ou do PostgreSQL.

Marcar notificações lidas executa uma gravação parametrizada em lote em vez de até 100 operações concorrentes.

Dashboard mostra horário da última leitura bem-sucedida do Hub e botão Atualizar dados, sem afirmar que esse horário é a última sincronização remota. Indicadores, filtros e detalhamentos existentes foram preservados.

Validação: builds backend/frontend, testes automatizados, lint e varredura de segredos. A validação visual em navegador não foi concluída: instalação do Chromium retornou arquivo inválido e navegador remoto recusou conexão com servidor local. Não considerar todas as telas visualmente homologadas.

Na instalação: atualizar e reiniciar; conferir prioridade da sincronização com metadados pendentes, retomada após reiniciar, notificações lidas e atualização manual no Dashboard. Coletar log se persistirem P1001/P2024; não aumentar o pool sem verificar capacidade e conexões no servidor PostgreSQL.
