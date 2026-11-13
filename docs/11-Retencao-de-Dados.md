# Inventário e plano de retenção de dados

## Estado atual

O TechLead Hub não aplica uma política geral de expurgo automático. Isso preserva históricos usados em SLA, produtividade, reconciliação e investigação, mas significa que a organização ainda precisa aprovar prazos de retenção e descarte. Não configure limpeza ad hoc em produção: tickets, Work Items, conversas e históricos podem alimentar análises e auditorias.

Os prazos abaixo são decisões pendentes, não períodos configurados pelo aplicativo.

| Categoria | Exemplos persistidos | Uso operacional | Decisão pendente |
|---|---|---|---|
| Identidade e sessão | `User`, `UserSession`, `PasswordResetToken`, avatares | Acesso e segurança | Retenção após desligamento, expiração e descarte de avatares/tokens |
| Tickets e dados brutos | `Ticket.rawData`, ações, apontamentos, históricos de responsável/status e enriquecimento | SLA/OLA, investigação, produtividade e reconciliação Movidesk | Prazo por dado operacional e eventual minimização do payload bruto |
| Azure DevOps | `AzureWorkItem.rawFields`, `rawRelations`, descrições e sincronizações | Correlação, versões, cobertura e investigação | Prazo de histórico e conteúdo externo sincronizado |
| Comunicação e reuniões | `ChatMessage`, anexos, presença, eventos online, reuniões e participantes | Colaboração, incidentes, calendário local e auditoria de acesso | Prazo de mensagens/anexos, presença e dados de reuniões canceladas |
| Auditoria e feedback | `AuditLog`, metadados de feedback e logs de sincronização | Incidentes, mudanças administrativas e suporte | Prazo de auditoria, dados identificáveis e texto de feedback |
| Estado temporário e fila | Outbox Teams, snapshots de qualidade, cache de aplicação | Retry de integrações, tendências e operação | Prazo de itens enviados/mortos e snapshots históricos |
| Backups e logs de infraestrutura | Dumps PostgreSQL, logs de proxy/banco e artefatos de recuperação | Recuperação e resposta a incidente | Prazo, criptografia, acesso, retenção legal e teste de descarte |

## Aprovação necessária

O dono do processo e Segurança/Privacidade devem aprovar para cada categoria: finalidade, prazo, base aplicável, evento que inicia a contagem, exceções de retenção legal/investigação, método de anonimização ou descarte e evidência de execução. Revisar também os dados enviados às integrações externas e os subprocessadores de hospedagem.

Após aprovação, implementar rotinas específicas e auditáveis por categoria, com modo de simulação, limites de lote, exclusão em transação quando possível, métricas de itens afetados, proteção contra apagar registros vinculados ainda necessários e procedimento de restauração. Não usar `migrate reset` nem exclusão manual como mecanismo de retenção.

Backups precisam de prazo próprio: apagar registros da base ativa não apaga suas cópias existentes. O runbook deve incluir expiração das cópias, restauração de teste e tratamento de uma solicitação de eliminação dentro do ciclo de backup.

## Revisão operacional

Até os prazos serem aprovados, acompanhar mensalmente o crescimento do PostgreSQL por tabela e o tamanho/idade dos backups. Registrar a decisão pendente com responsável e data de revisão; essa medição serve para capacidade, não autoriza descarte.
