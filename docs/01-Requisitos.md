# Requisitos do TechLead Hub

## Objetivo

Centralizar a operação de suporte e sustentação SIMER, correlacionando atendimentos Movidesk, Work Items do Azure DevOps, versões, clientes, analistas, conhecimento e comunicação interna.

## Perfis

- **Administrador:** configura integrações, aprova usuários, gerencia sessões e acessa auditoria.
- **Coordenador:** acompanha indicadores, carga, riscos, chat e relatórios gerenciais.
- **Analista:** consulta e conduz sua operação, participa de canais autorizados e usa a base de conhecimento.

## Requisitos funcionais

1. Autenticar usuários aprovados e ativos.
2. Manter somente uma sessão operacional por usuário entre Web e Desktop.
3. Importar e sincronizar dados Movidesk e Azure DevOps com histórico auditável.
4. Apresentar dashboards, SLA/OLA, clientes, analistas, versões e pontos de atenção.
5. Oferecer chat interno com canais, membros, histórico e vínculos contextuais.
6. Bloquear envio de padrões reconhecíveis de credenciais no chat.
7. Disponibilizar Central de Coordenação apenas para Administrador e Coordenador.
8. Consultar conhecimento operacional publicado na Wiki Azure DevOps.
9. Correlacionar Mapa SIMER e Regras do Sistema/BPMN na Central de Investigação sem concluir causalidade automaticamente.
10. Preservar segredos criptografados e nunca devolvê-los pela API.
11. Produzir relatórios e manter trilha de auditoria das operações críticas.

## Requisitos não funcionais

- PostgreSQL como fonte persistente.
- API autenticada por sessão persistida e token de curta duração.
- Criptografia AES-256-GCM para configurações sensíveis.
- TLS obrigatório fora do ambiente local.
- Paginação e limites de payload nas consultas de volume.
- Build Web, Backend e Desktop validado em CI.
- Migrações somente aditivas durante versões RC, salvo plano explícito de rollback.
- Logs sem senhas, tokens, conteúdo de mensagens ou strings de conexão.
