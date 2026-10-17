# Migração segura de chave para SystemSetting

**Estado: ferramenta preparatória. Não execute `--apply` até o Desktop e o Docker
receberem persistentemente a mesma `SYSTEM_CONFIG_KEY`.** A aplicação da
migração sem esse provisionamento fará instâncias perderem o acesso às
configurações, ainda que o banco permaneça íntegro.

A chave é compartilhada por ambiente/banco, não por usuário. `JWT_SECRET` serve
para assinar tokens e não deve ser usada em novas gravações de `SystemSetting`.
Todas as instâncias que compartilham o banco precisam receber o mesmo valor de
`SYSTEM_CONFIG_KEY` por configuração segura de implantação. Não gere uma chave
nova automaticamente por estação nem grave a chave em `SystemSetting`.

## Premissas

- Janela de manutenção, com todos os processos e schedulers do TechLead Hub parados.
- `DATABASE_URL` apontando para o banco correto.
- `JWT_SECRET` **original**, que no VS Code retornou `readable`.
- `SYSTEM_CONFIG_KEY` de destino, distinta de `JWT_SECRET`, estável e protegida por cofre de segredos; provisionada em todas as instâncias.
- Backup verificado de `SystemSetting` e backup/restauração do PostgreSQL disponível.
- Credencial de banco com permissões mínimas necessárias, nunca encaminhada em logs.

## Simulação — somente leitura

Executar no backend com as variáveis carregadas no processo, sem copiá-las
para mensagens ou para o histórico do terminal:

```powershell
npm --prefix backend run config:key-migrate
```

A simulação valida todos os registros conhecidos contra a chave de destino
ou a chave JWT legada, sem exibir valores nem modificar o banco.

## Aplicação — somente após homologação do provisionamento

Após backup validado e com o procedimento de rollback documentado, definir
`CONFIG_MIGRATION_BACKUP_CONFIRMED=YES` somente nessa execução e executar:

```powershell
npm --prefix backend run config:key-migrate -- --apply
```

O comando usa uma transação única com verificação de concorrência. Erros de
descriptografia bloqueiam a escrita. Não modifica `JWT_SECRET`.

## Pós-migração

Validar `/api/system-settings/credentials-health` como ADMIN em Desktop e
Docker, testar Azure DevOps e Movidesk e confirmar retomada dos schedulers.
Somente após essas verificações iniciar rotação coordenada de chaves antigas.
Não reutilizar GitHub Actions Secrets como fonte de segredo embutido no bundle.
