# Banco de dados

## Principais domínios

| Domínio | Tabelas |
|---|---|
| Identidade | `User`, `UserSession`, `PasswordResetToken` |
| Auditoria | `AuditLog`, `ImportRun`, `AzureSyncRun` |
| Operação | `Ticket`, `AzureWorkItem` |
| Chat | `ChatChannel`, `ChatChannelMember`, `ChatMessage` |
| Configuração | `SystemSetting` |
| Calendário | `CalendarMeeting`, `CalendarMeetingParticipant` |
| Integrações auxiliares | Outbox de alertas Teams, catálogos/respostas Movidesk e snapshots de qualidade |

## Chat

- Um canal possui tipo, membros e contexto opcional.
- A associação `ChatChannelMember` é a autorização efetiva de leitura e escrita.
- Mensagens removidas são descaracterizadas e recebem `deletedAt` para auditoria.
- Conteúdo de mensagens não é copiado para `AuditLog`.
- Índices por canal/data suportam leitura incremental.

## Proteção

- `passwordHash` usa bcrypt e nunca é retornado nas consultas públicas.
- Tokens de redefinição e sessão são armazenados como hash.
- `SystemSetting.value` é cifrado com AES-256-GCM.
- `SYSTEM_CONFIG_KEY` deve ter pelo menos 32 caracteres e permanecer fora do banco.
- Backups devem ser criptografados, ter retenção definida e restauração testada.

## Crescimento e retenção

- O histórico operacional e payloads brutos são mantidos para análises e reconciliação; não há expurgo geral automático.
- Categorias e decisões pendentes estão em [`11-Retencao-de-Dados.md`](11-Retencao-de-Dados.md). Medir tamanho por tabela e backups mensalmente, sem tratar a medição como autorização para excluir dados.
- Ao implementar um prazo aprovado, excluir por categoria e lote, manter auditoria da execução e considerar dependências entre ticket, ações, históricos e anexos.

## Migrações

```bash
npm run prisma:generate --prefix backend
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

Nunca execute `migrate reset` em produção.
