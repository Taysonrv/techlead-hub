# Arquitetura

## Componentes

```mermaid
flowchart TD
  UI[React Web / Electron] -->|HTTPS + Bearer| API[Express API]
  API --> DB[(PostgreSQL)]
  API --> MOV[Movidesk]
  API --> AZ[Azure DevOps]
  API --> MS[Microsoft Graph]
  API --> SMTP[SMTP corporativo]
```

- `frontend`: React, Material UI, Vite e carregamento sob demanda.
- `backend`: Express, Prisma, serviços de domínio e schedulers.
- `desktop`: Electron; inicia o backend embarcado e gerencia atualização.
- `PostgreSQL`: usuários, sessões, tickets, Work Items, sincronizações, chat, configurações e auditoria.
- `Microsoft Graph`: SharePoint/BPMN e fundação para Planner, Outlook e Teams.

## Limites de confiança

1. O navegador nunca recebe `DATABASE_URL`, PAT, client secret ou chaves internas.
2. Toda rota em `/api`, exceto autenticação inicial, exige sessão válida.
3. A autorização é aplicada no backend; ocultar menus no frontend não é controle de segurança.
4. Canais do chat são filtrados por associação do usuário.
5. A Central de Coordenação exige `ADMIN` ou `COORDENADOR`.
6. Integrações externas utilizam timeouts e não devem bloquear a API indefinidamente.

## Atualização Desktop

O aplicativo usa o canal `beta` para versões RC. A release precisa conter instalador, `.blockmap` e `beta.yml`. O manifesto é validado antes de a release ser promovida.
