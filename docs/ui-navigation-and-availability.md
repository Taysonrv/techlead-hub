# Navegação, ações do topo e disponibilidade

## Carregamento e disponibilidade

- O heartbeat renova o token da mesma sessão sem limpar o snapshot compartilhado. Uma troca de usuário, sessão, papel ou permissões continua invalidando os dados.
- Respostas de um heartbeat iniciado antes do logout ou de outro login são descartadas.
- A importação renova o snapshot dentro da sessão. Quem aguardava a versão anterior recebe a versão atualizada, sem exibir `SnapshotInvalidatedError` como falha de carregamento.
- Cancelamentos de requisições não acionam o aviso global. Falhas de conexão, timeout e respostas 502/503/504 provocam uma verificação independente de `/health`, com limite de 5 segundos.
- O aviso aparece quando essa verificação também falha ou informa banco indisponível. Uma falha isolada de uma rotina mantém seu tratamento local.
- Enquanto houver indisponibilidade confirmada, a comunicação é verificada a cada 10 segundos. Ao recuperar, o aviso é removido e as telas que usam o snapshot compartilhado tentam atualizar seus dados.
- Um resultado antigo da verificação não pode sobrepor uma resposta mais recente de sucesso da API.

No desenvolvimento, o Vite encaminha `/api` e `/health` para `http://127.0.0.1:3333`. Backend e frontend devem estar em execução. `VITE_API_URL` continua disponível para apontar a API para outra origem.

## Sidebar

| Grupo | Rotinas |
| --- | --- |
| Início | Visão Operacional |
| Operação | Tickets, Minha Operação, Problemas Conhecidos, Pendências & Riscos, Qualidade dos Dados |
| Gestão | Gestão & Inteligência, Inteligência Operacional, Painel da Coordenação, Liderança Técnica |
| Análises | Desempenho & SLA, Relatórios, Serviços SIMER, Investigação SIMER |
| Desenvolvimento | Painel de Tasks de Correções, Evoluções, Apoios, Versões |
| Cadastros | Analistas, Clientes |
| Conhecimento | Base de Conhecimento |

Cada rotina respeita sua permissão existente. Grupos vazios são ocultados, o início dos grupos permanece recolhido e os links usam correspondência exata para destacar apenas a rotina atual. Configurações e administração continuam no rodapé e no menu do perfil.

## Ações do topo

Tema, calendário, chat e notificações usam `TopBarActionButton`: 46 × 46 px, mesma borda, raio, sombra, tamanho do ícone e foco de teclado. Os contadores mantêm seu significado e compartilham o estilo. O calendário e as notificações indicam a abertura do painel por `aria-expanded`.

Em larguras inferiores a 1200 px, a busca global ocupa uma linha abaixo das ações, evitando sobreposição e bloqueio dos cliques. O cabeçalho do Chat reserva essa altura adicional.

## Validação

Os testes de regressão cobrem renovação de tokens, isolamento entre sessões, importação durante o carregamento, cancelamento de requisições, confirmação de indisponibilidade e recuperação automática. A validação visual usa as telas e os componentes reais, com respostas simuladas da API; não certifica a disponibilidade do ambiente nem os totais de produção.
