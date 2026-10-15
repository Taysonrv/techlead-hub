# Homologação de pré-publicação — TechLead Hub (Desktop e Web)

## Estado da revisão

Este documento define **testes pendentes**, não certifica ambiente implantado. A revisão de código corrige estabilidade do backend e apresentação, mas não substitui execução no Windows instalado, navegador e Docker corporativo.

## Builds e testes locais

No VS Code, com processos de desenvolvimento parados ao executar Prisma:

```powershell
git switch fix/pre-release-ux-stability-audit
git pull --ff-only origin fix/pre-release-ux-stability-audit
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend test
npm --prefix desktop run build:desktop
```

Validar a disponibilidade dos scripts do Desktop com `npm --prefix desktop run`. Caso o lock da DLL do Prisma impeça gerar o client, encerrar o processo Node do backend *específico* e repetir, sem apagar .env/secure-config.

## Critérios por módulo

| Área | Critério de aceite | Evidência |
| --- | --- | --- |
| Dashboard e Clientes | Mesmos filtros de cliente/escopo e datas; coortes abertos, resolvidos, fechados e backlog explicadas; sem cards duplicados | Print + export Movidesk comparativo |
| Painel mensal de Correções | Histórico Azure da data correta; valores sem histórico aparecem como sem medição; cards, drill-down, filtros e export coerentes | Setembro e outubro por cliente, em modo claro/escuro |
| Chat | Mensagem recebida e presença atualizadas; perda e retorno de rede não disparam requisições em loop; reconexão SSE funciona via HTTPS | Abrir duas sessões de teste autorizadas; interromper e retomar rede |
| Notificações | Sucesso/aviso/informativo com mesma largura e altura; filas antigas no sino; avisos nativos só com Desktop oculto | Capturas modo claro/escuro, janela aberta e bandeja |
| Azure DevOps | Após interrupção da rede, scheduler mantém dados anteriores e retoma novas incrementais; sem duplicações | Status de últimas execuções e logs resumidos, sem PAT |
| Movidesk | Conexão e carga incremental retornam após rede/BD; monitor mostra data e erros; sem excluir registros | Últimos ciclos e histórico de sincronização |
| Desktop | Fechar por X oculta na bandeja; opção Sair completamente encerra; falha do backend inicia até 5 tentativas espaçadas | Gerenciador de tarefas + `/health/ready` |
| Configurações e Dados | Sessões/diagnósticos avançados recolhidos; integrações, permissões, reset seguro e histórico permanecem disponíveis | Modo claro/escuro, notebook 1366x768 |
| Auditoria de baixa | Seleção SOMENTE carteira oficial SIMER; falsos positivos com documentos ou chamados antigos excluídos; export equivale à lista | Evidência por ticket e cobertura do histórico |

## HTTPS / certificado digital (responsabilidade da infraestrutura)

Usar `deploy/docker-compose.example.yml` para **banco externo**, `deploy/.env.example` como modelo e `deploy/HTTPS-CERTIFICADO.md` como handoff de Nginx/ingress.

- Certificado e chave privada ficam **fora da imagem** no proxy reverso/ingress, com FQDN, cadeia TLS e renovação validados pela infraestrutura.
- Testar HTTP -> HTTPS, `GET https://<FQDN>/health/ready`, autenticação via FQDN, chat SSE sem buffering, reconexões e ausência de mixed content.
- Porta 3333 deve ficar inacessível externamente; usar exposição/roteamento controlado para o proxy.
- `JWT_SECRET`, `SYSTEM_CONFIG_KEY` e `DATABASE_URL` devem ser estáveis, compatíveis com o banco e providos por cofre. **Não recriptografar dados nem executar `config:key-migrate --apply` durante homologação.**
- A URL e o certificado reais precisam ser fornecidos pelo time de infraestrutura; sem esse ambiente a validação TLS é apenas documental.

## Publicação e rollback

1. Mesclar PRs dependentes **em ordem** e confirmar CI verde na `main`.
2. Atualizar `main` local, executar builds e `git status --short`; homologar Web e Desktop.
3. Conferir versão e changelog do release; publicar via `release.yml` no canal beta. Não disparar duas publicações concorrentes.
4. Em Docker externo, implantar **tag imutável**, confirmar `/health/ready`, registrar rollback para imagem anterior e manter segredo e banco.
5. Caso ocorram novas falhas, reverter imagem/installer da aplicação preservando banco e chaves; **migrações não devem ser revertidas automaticamente**.
