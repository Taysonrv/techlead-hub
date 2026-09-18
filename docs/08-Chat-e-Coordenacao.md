# Chat interno e Central de Coordenação

## Chat

O chat mantém a comunicação operacional próxima dos indicadores. A primeira entrega oferece canais, histórico, mensagens, associação de membros, respostas preparadas no modelo e atualização periódica.

Tipos de canal:

- `DIRECT`: conversa entre usuários.
- `TEAM`: canal geral da equipe.
- `CLIENT`: contexto de cliente.
- `CONTEXT`: ticket, Work Item, versão ou outro objeto operacional.

O backend sempre confirma a associação antes de listar, enviar ou remover mensagens. A criação do canal aceita somente usuários ativos e aprovados, a quantidade de não lidas é calculada individualmente e menções por `@usuario` geram notificações com navegação para o canal.

## Central de Coordenação

A visão consolida backlog atual, criticidade, itens sem movimento há 72 horas, vencimentos em sete dias, bloqueios, itens sem responsável e carga combinada Movidesk/Azure por analista.

O acesso é limitado a `ADMIN` e `COORDENADOR`.

## Evoluções previstas

- WebSocket/SSE para entrega em tempo real.
- Menções e notificações direcionadas.
- Criação de tarefas Planner a partir da mensagem.
- Canais contextuais criados diretamente das laterais de Ticket e Work Item.
- Retenção configurável e exportação administrativa auditada.
