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
