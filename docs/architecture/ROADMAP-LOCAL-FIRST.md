# Radar de arquitetura — modo local sem servidor dedicado

**Estado:** proposta futura, não implementada e não habilitada em produção.
**Base de referência:** v2.1.0-rc.13 (Electron + Express/Prisma/PostgreSQL).

## Objetivo
Permitir que a primeira instalação do Desktop inicialize armazenamento local persistente, sem exigir servidor PostgreSQL remoto. A aplicação deverá continuar operando no modo atual enquanto o modo local não for homologado.

## Estratégia recomendada
1. Criar uma abstração de armazenamento e configuração de modo `server` / `local` antes de trocar o banco.
2. Avaliar SQLite via Prisma para instalações individuais, considerando incompatibilidades de SQL, migrações, transações, consultas JSON e índices em relação ao PostgreSQL. Não basta trocar `DATABASE_URL`.
3. Criar o banco local na pasta de dados persistentes do usuário do Electron, **fora** do diretório da aplicação e fora da pasta substituída pelo atualizador. Inicializar schema e dados básicos de modo transacional e idempotente.
4. Proteger credenciais com o mecanismo seguro do sistema operacional; criptografar backups e dados sensíveis conforme análise de risco. Banco local não implica acesso sem autenticação.
5. Definir se o modo local é **usuário único** ou precisa de sincronização multiusuário. Para vários usuários, projetar identidade, conflitos, filas offline, sincronização e recuperação antes de oferecer esse modo.
6. Garantir exportação/backup, restauração testada, migração para servidor no futuro e rollback de versão.

## Crescimento e retenção
- Exibir tamanho do banco, anexos, cache, logs e backups separadamente, com alertas por limites configuráveis.
- Limpeza automática **somente** de cache reconstruível, arquivos temporários, logs rotacionados e eventos técnicos com política de retenção definida.
- Para anexos e histórico operacional, usar arquivamento/exportação verificável e retenção aprovada; nunca excluir automaticamente tickets, apontamentos, auditoria ou conversas.
- Executar manutenção fora do horário de uso, com limites de tempo, espaço livre mínimo e proteção contra desligamento.
- SQLite: avaliar checkpoint de WAL, `VACUUM`/incremental vacuum e `PRAGMA integrity_check` somente após testes e com backup.
- Backups rotativos devem ter política de retenção e cópia externa opcional; nunca deixar o único backup no mesmo dispositivo sem aviso.

## Critérios de aceite futuros
- Instalação limpa offline cria banco e reinicializa sem perda de dados.
- Atualização do Electron preserva configurações, credenciais e arquivos.
- Restauração de backup recupera tickets, apontamentos e anexos com integridade.
- Uso prolongado e crescimento de dados não bloqueiam a interface; a manutenção não apaga registros de negócio.
- Migração de modo local para servidor é reversível ou possui exportação confiável.

## Produção atual
Manter PostgreSQL como fonte de verdade. Não executar migrações em produção sem backup restaurável, verificação de compatibilidade, plano de rollback e execução controlada. Não habilitar modo local como fallback silencioso: isso criaria bases divergentes.
