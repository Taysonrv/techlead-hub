# TechLead Hub

Aplicação Web e Desktop para inteligência operacional do suporte e sustentação SIMER.

## Versão em preparação

`2.1.0-rc.2` (versão declarada no pacote Desktop)

O TechLead Hub consolida dados operacionais do Movidesk e Azure DevOps para apoiar analistas e coordenação em investigação, acompanhamento de tickets, Tasks, qualidade dos dados, SLA/OLA, versões e recorrências. Também inclui chat interno, calendário/reuniões, notificações e consultas públicas complementares.

### Áreas principais

- **Operação:** Dashboard, Minha Operação, Tickets, Pontos de Atenção e Pendências.
- **Análise:** Clientes, Analistas, Desempenho e Serviços.
- **Desenvolvimento:** Correções, Evoluções, Apoios e Versões.
- **Inteligência:** Liderança Técnica, Central de Investigação, Mapa SIMER/Regras e Base de Conhecimento.
- **Gestão:** Central da Coordenação, Relatórios, Usuários e Configurações.

### Integrações atuais

- Movidesk para dados de atendimento.
- Azure DevOps para Work Items e Wiki.
- Banco local via Prisma para consolidação e análises.
- Microsoft Teams Workflows para alertas opcionais de novos tickets. A fila é persistida e só envia quando `TEAMS_ALERTS_ENABLED=true` e o webhook e URL-base estão configurados.
- SMTP corporativo para fluxos de e-mail quando configurado.

SharePoint, Planner e sincronização com calendário do Outlook não fazem parte da arquitetura ativa. O calendário do Hub é local; o envio ao Teams é uma integração opcional por webhook, sem dependência de Microsoft 365 Graph.

## Desenvolvimento

Na raiz do repositório:

```powershell
npm --prefix backend run build
npm --prefix frontend run build
```

Para desenvolvimento:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

O aplicativo Desktop possui scripts próprios em `desktop/package.json`, incluindo `build:all`, validação e empacotamento Electron.

## Documentação

Consulte `docs/` para requisitos, arquitetura, segurança, retenção de dados e operação, incluindo [`docs/11-Retencao-de-Dados.md`](docs/11-Retencao-de-Dados.md). Os alertas Teams são opcionais e protegidos por fila persistente; as integrações Microsoft 365 não descritas acima não fazem parte da arquitetura ativa.
