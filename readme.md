# TechLead Hub

Aplicação Web e Desktop para inteligência operacional do suporte e sustentação SIMER.

## Versão em preparação

`1.0.0-rc.15`

O TechLead Hub consolida dados operacionais do Movidesk e Azure DevOps para apoiar analistas e coordenação em investigação, acompanhamento de tickets, Tasks, qualidade dos dados, SLA/OLA, versões e recorrências.

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

Microsoft 365, SharePoint, Planner, Outlook e Teams não fazem parte da arquitetura ativa desta versão.

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

Consulte `docs/` para requisitos, arquitetura, segurança e operação. A documentação deve acompanhar a arquitetura ativa da aplicação; referências a integrações removidas devem ser tratadas como legado até sua revisão.
