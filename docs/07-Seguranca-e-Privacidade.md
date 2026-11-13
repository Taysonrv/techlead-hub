# Segurança e prevenção de vazamento

## Controles implementados

- Sessão validada simultaneamente no JWT e no PostgreSQL.
- Expiração por inatividade e revogação administrativa.
- Token Web mantido em `sessionStorage`, com migração e remoção do legado em `localStorage`.
- CORS por lista explícita e localhost para desenvolvimento.
- CSP, HSTS em HTTPS, `nosniff`, bloqueio de iframe, política de referência e permissões do navegador.
- `Cache-Control: no-store` nas respostas da API.
- Identificador único por requisição (`X-Request-Id`).
- Segredos de configuração cifrados com AES-256-GCM.
- Chat protegido por associação ao canal e detecção de chaves privadas, Bearer tokens, PATs e strings de conexão.
- Busca global limita navegação e resultados ao conjunto de permissões vigente do usuário.
- Auditoria registra ação, entidade e metadados mínimos; nunca o conteúdo da mensagem.

## Regras operacionais

1. Não enviar dados de clientes, credenciais ou documentos fiscais em canais não autorizados.
2. Não registrar payloads completos em logs de aplicação.
3. Usar segredos do orquestrador para `JWT_SECRET`, `SYSTEM_CONFIG_KEY` e `DATABASE_URL`.
4. PATs e credenciais do Azure DevOps devem seguir menor privilégio, armazenamento criptografado e rotação conforme política corporativa.
5. Revogar imediatamente sessões e credenciais após desligamento ou suspeita de incidente.
6. Seguir o inventário de retenção em `11-Retencao-de-Dados.md`; não ativar expurgo automático de dados de negócio antes da aprovação formal dos prazos pelo responsável de Segurança/Privacidade e pelo dono do processo.

## Resposta a incidente

1. Isolar o ambiente afetado sem apagar evidências.
2. Revogar sessões e rotacionar segredos potencialmente expostos.
3. Preservar `AuditLog`, logs do proxy e do banco.
4. Identificar dados, usuários, período e integrações impactadas.
5. Acionar Segurança/Privacidade e seguir o processo corporativo de comunicação.
6. Corrigir, testar, restaurar e registrar a causa raiz.

## Pendências recomendadas antes da versão estável

- Varredura SAST e de segredos no CI.
- Dependabot ou equivalente para npm e GitHub Actions.
- Expandir os testes de autorização por rotina e de acesso horizontal ao chat e à busca global.
- Aprovar prazos formais de retenção e anonimização para cada categoria em `11-Retencao-de-Dados.md`.
- Cookies HttpOnly para a versão Web centralizada, com proteção CSRF.
