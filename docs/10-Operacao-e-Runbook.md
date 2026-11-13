# Operação e runbook

## Verificações

- Liveness: `GET /health`.
- Readiness: `GET /health/ready` confirma conexão mínima com PostgreSQL e informa estado/idade da última sincronização Azure. HTTP 200 não significa que as integrações estejam completas nem que Movidesk esteja atualizado.
- Para detalhes de execução, usar a Central de Sincronizações autenticada: conferir última execução Movidesk e Azure, duração, contagens, erros e configuração do scheduler. Comparar idade com os intervalos configurados; investigar `PROCESSING` sem conclusão por mais de duas janelas esperadas ou ausência de novas execuções por três janelas.
- Conferir versão e runtime em Configurações. Após deploy, validar health, Central de Sincronizações, log da aplicação pelo `X-Request-Id` e os fluxos essenciais.
- Os schedulers Movidesk usam coordenação em memória. Não habilitar schedulers em múltiplas réplicas que compartilham as mesmas credenciais/banco; manter uma instância ativa até haver lease distribuído para esses jobs.
- Azure tem advisory lock PostgreSQL entre instâncias. A fila de alertas Teams usa reivindicação atômica e lease; acompanhar logs `[teams-alerts]` para falhas/itens em DEAD e confirmar a entrega no destino. O endpoint de readiness não verifica a fila Teams.
- A previsão do tempo do calendário usa a chave `WEATHER_API_KEY` no ambiente do backend e a API da WeatherAPI. Configure a chave no `.env` local do backend, nunca no frontend ou no controle de versão. Sem a chave, o calendário continua funcionando e informa que a previsão não está configurada. A cidade padrão fica salva por usuário na tabela `User`.

## Atualização e configuração das instalações Windows

- Atualizações do instalador mantêm o mesmo `appId` (`com.aliare.techleadhub`) e não removem o `userData` do usuário. Os segredos locais ficam criptografados pelo Windows nesse diretório. Não escolha remover dados do aplicativo nem apague a pasta `userData` do TechLead Hub ao atualizar.
- Em uma máquina nova, importe o `.env` de provisionamento na Central de Recuperação e confirme `DATABASE_URL` e `SYSTEM_CONFIG_KEY`. A chave deve ser a mesma usada para criptografar as configurações Azure e Movidesk do banco compartilhado; gerar outra chave não recupera os valores.
- Se existirem registros antigos criptografados pela `JWT_SECRET` desta instalação, a recuperação aceita a chave compartilhada quando ela valida os registros correspondentes e os demais ainda podem ser lidos localmente. No próximo carregamento, os registros legados recuperáveis são recriptografados com `SYSTEM_CONFIG_KEY`, em uma transação protegida contra sobrescrever alterações concorrentes.
- Mantenha `SYSTEM_CONFIG_KEY` em cofre corporativo ou distribuição segura de TI. Não a inclua no instalador, repositório, release ou chamado. Sem ela, a instalação avisa que as integrações estão ilegíveis e preserva os dados para recuperação posterior.
- Se uma atualização não abrir, preserve `%APPDATA%` e os logs. A configuração local inválida ou protegida por outro perfil do Windows não deve ser apagada nem regravada automaticamente.
- No Desktop instalado, a chave armazenada no safeStorage do Windows prevalece sobre uma variável `SYSTEM_CONFIG_KEY` antiga do processo. Importe a chave original pelo diagnóstico e reinicie para que a chave recuperada seja usada.
- O certificado Authenticode é opcional no workflow de release. Quando não configurado, o instalador é publicado sem assinatura e o SmartScreen pode exibir um aviso ao usuário. Se `WINDOWS_SIGNING_CERTIFICATE_PFX` e, quando aplicável, `WINDOWS_SIGNING_CERTIFICATE_PASSWORD` estiverem configurados, o electron-builder usa essas credenciais para assinar o instalador. Mesmo uma assinatura válida pode precisar acumular reputação para reduzir avisos do SmartScreen.

## Publicação RC

1. Executar CI no `main`.
2. Disparar `Publicar TechLead Hub` com versão sem prefixo `v` e canal `beta`.
3. Confirmar imagem `ghcr.io/taysonrv/techlead-hub:<versão>` e tag `beta`.
4. Confirmar `.exe`, `.blockmap` e `beta.yml` na release.
5. Confirmar no log da pipeline se o instalador foi assinado ou publicado sem assinatura e se a release está publicada como **prerelease** (não draft). O aplicativo consulta a API pública do GitHub, seleciona a maior versão RC com `beta.yml` e usa diretamente os artefatos dessa tag; se a API estiver indisponível, usa o provedor GitHub do `electron-updater` como contingência.
6. Testar atualização partindo da RC anterior.
7. Realizar smoke test: login, dashboard, chat, coordenação, importação e logout.

## Backup e rollback

- Gerar backup antes de aplicar migrações.
- Guardar tag e digest da imagem anterior.
- Migrações RC devem ser compatíveis com rollback da aplicação.
- Em incidente, restaurar aplicação anterior; restaurar banco apenas mediante análise, para evitar perda de dados novos.
- Acompanhar mensalmente crescimento das tabelas e dos backups. Consultar `11-Retencao-de-Dados.md`; medição não autoriza expurgo sem prazo aprovado.

## Tasks e tickets sem atualização

- Builds concluídos e agendador habilitado não confirmam uma sincronização bem-sucedida. Azure HTTP 401 exige validar organização, projeto e credencial em Configurações > Azure DevOps. A credencial central salva no Hub prevalece sobre o `.env`; testar uma nova credencial não a salva. Após salvar e testar, conferir uma execução concluída em Dados e Sincronizações. Uma carga completa pode recuperar Tasks omitidas por cargas antigas que registraram sucesso sem dados.
- Movidesk executa a cada 5 minutos por padrão. A primeira incremental após esta atualização e uma vez a cada 24 horas reconsultam os últimos 35 dias, sempre no escopo SIMER e respeitando o limite global de requisições. A janela é aplicada à última atualização do ticket, sem limitar a data original de abertura; isso permite recuperar resoluções recentes de tickets antigos e cobre o mês corrente do Dashboard. Se o cursor anterior for mais antigo, essa janela maior é preservada.
- O cursor passa a usar o início da execução concluída, com sobreposição de 6 horas. Erros de consulta ou importação não confirmam nem avançam a janela. A reconciliação não força a reimportação do baseline anual.
- `consultas=1`, `paginas=0`, `total=0` significa que a API respondeu sem tickets na janela consultada. A tela registra a última incremental concluída mesmo quando não houve importação. Esse resultado não comprova que um ticket específico está ausente no Movidesk.
- Logs `movidesk-metadata` e `movidesk-enrichment` tratam pendências de metadados de tickets já existentes; não significam que novos tickets foram importados. Compare IDs ausentes, cliente, responsável e data da última atualização no Movidesk com o escopo e a janela registrados no ciclo.
- Depois da sincronização, recarregue a tela de Tasks/Tickets e confirme os IDs. A apuração histórica mensal tem consulta própria: use Recarregar no relatório depois de validar o acesso ao histórico.
