# Operação e runbook

## Verificações

- Liveness: `GET /health`.
- Readiness: `GET /health/ready`.
- Conferir banco, versão e runtime em Configurações.
- Validar Central de Sincronizações após atualização.

## Publicação RC

1. Executar CI no `main`.
2. Disparar `Publicar TechLead Hub` com versão sem prefixo `v` e canal `beta`.
3. Confirmar imagem `ghcr.io/taysonrv/techlead-hub:<versão>` e tag `beta`.
4. Confirmar `.exe`, `.blockmap` e `beta.yml` na release.
5. Confirmar que a release está publicada como **prerelease** (não draft). O aplicativo consulta a API pública do GitHub, seleciona a maior versão RC com `beta.yml` e usa diretamente os artefatos dessa tag; se a API estiver indisponível, usa o provedor GitHub do `electron-updater` como contingência.
6. Testar atualização partindo da RC anterior.
7. Realizar smoke test: login, dashboard, chat, coordenação, importação e logout.

## Backup e rollback

- Gerar backup antes de aplicar migrações.
- Guardar tag e digest da imagem anterior.
- Migrações RC devem ser compatíveis com rollback da aplicação.
- Em incidente, restaurar aplicação anterior; restaurar banco apenas mediante análise, para evitar perda de dados novos.

## Tasks e tickets sem atualização

- Builds concluídos e agendador habilitado não confirmam uma sincronização bem-sucedida. Azure HTTP 401 exige validar organização, projeto e credencial em Configurações > Azure DevOps. A credencial central salva no Hub prevalece sobre o `.env`; testar uma nova credencial não a salva. Após salvar e testar, conferir uma execução concluída em Dados e Sincronizações. Uma carga completa pode recuperar Tasks omitidas por cargas antigas que registraram sucesso sem dados.
- Movidesk executa a cada 5 minutos por padrão. A primeira incremental após esta atualização e uma vez a cada 24 horas reconsultam os últimos 7 dias, sempre no escopo SIMER e respeitando o limite global de requisições. Se o cursor anterior for mais antigo, essa janela maior é preservada. Isso recupera lacunas recentes; não comprova completude de períodos anteriores aos sete dias.
- O cursor passa a usar o início da execução concluída, com sobreposição de 6 horas. Erros de consulta ou importação não confirmam nem avançam a janela. A reconciliação não força a reimportação do baseline anual.
- `consultas=1`, `paginas=0`, `total=0` significa que a API respondeu sem tickets na janela consultada. A tela registra a última incremental concluída mesmo quando não houve importação. Esse resultado não comprova que um ticket específico está ausente no Movidesk.
- Logs `movidesk-metadata` e `movidesk-enrichment` tratam pendências de metadados de tickets já existentes; não significam que novos tickets foram importados. Compare IDs ausentes, cliente, responsável e data da última atualização no Movidesk com o escopo e a janela registrados no ciclo.
- Depois da sincronização, recarregue a tela de Tasks/Tickets e confirme os IDs. A apuração histórica mensal tem consulta própria: use Recarregar no relatório depois de validar o acesso ao histórico.
