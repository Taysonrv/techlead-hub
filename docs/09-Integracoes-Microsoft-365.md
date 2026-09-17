# Integrações Microsoft 365

## Fundação atual

A aplicação utiliza OAuth 2.0 Device Code com Microsoft Graph. Tenant ID e Client ID são configurados pelo administrador; a senha do usuário nunca é armazenada.

## Sequência planejada

1. SharePoint e BPMN para conhecimento.
2. Planner para planos, tarefas, responsáveis e prazos.
3. Outlook Calendário para reuniões, entregas e acompanhamento.
4. Teams para alertas e compartilhamento de análises.
5. Outlook Mail para rascunhos e resumos, inicialmente com confirmação humana.

## Segurança

- Solicitar somente os escopos exigidos pela função ativada.
- Preferir permissões delegadas.
- Não persistir access token em texto simples.
- Não solicitar senha corporativa dentro do TechLead Hub.
- Exibir claramente a conta conectada e oferecer desconexão.
- Auditar ações de escrita no Planner, Outlook e Teams.

## Configuração no Entra ID

1. Registrar aplicação pública compatível com Device Code.
2. Cadastrar o Tenant ID e Client ID em Configurações.
3. Conceder consentimento apenas aos escopos aprovados.
4. Validar com usuário de homologação antes da liberação geral.
