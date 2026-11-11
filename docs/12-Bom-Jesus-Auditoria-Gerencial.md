# Homologação — Diagnóstico Gerencial Bom Jesus (v2)

## Escopo e referência
- Tela: **Central da Coordenação → Diagnóstico Gerencial — Bom Jesus**.
- Período inicial da interface: **01/07/2026 a 10/11/2026**, inclusive, no calendário de São Paulo (UTC−3).
- Cliente: **BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR**, correspondência exata.
- Responsabilidade: **analistas de Suporte SIMER** da lista operacional oficial, igual ao filtro `isWithSimer` da tela Clientes.
- A base exportada de referência pelo usuário possuía **451 atendimentos**; novas sincronizações, mudanças de responsável e novos filtros de data podem alterar o total.

## Conferências de aceite
1. **Escopo:** comparar IDs da aba "Tickets e evidências" com a exportação "Clientes → Abertos no período → Esse semestre", selecionando o cliente exato. Conferir IDs presentes só de um lado.
2. **Correções:** contar tickets com Work Item **Correção Clientes** no Azure. Separar **concluído**, **cancelado** e **em aberto**; demonstrar também **Tasks distintas** para evitar dupla contagem. Versão vinculada NÃO equivale a aceite ou implantação.
3. **Matriz de classificação:** conferir as quatro células do cruzamento **categoria Bug (atual)** × **Task de correção Azure**, cuja soma deve ser sempre igual ao total de tickets. O vínculo Azure prevalece sobre códigos customizados do Movidesk.
4. **OLA:** abrir a aba **OLA SUPORTE AUDITORIA** e ordenar pela coluna Excesso (horas úteis). Para cada alerta, confrontar abertura, data de criação da Task, prioridade, perfil do SLA, feriados nacionais e períodos de pausa com a tela **Desempenho & SLA**. A criação da Task é **proxy**, não prova do instante efetivo da passagem à Fábrica.
5. **Task cancelada:** assegurar que as canceladas não entrem nos denominadores de alertas ou percentual de cumprimento. Mostrar à parte.
6. **Qualidade:** distinguir conclusão técnica, versão cadastrada, solução Movidesk e reabertura posterior. "Reocorrência candidata" só indica sinal temporal/assunto, **nunca** regressão ou solução homologada.
7. **Reclassificação:** verificar a aba **AUDITORIA ADEQUACOES**. "OBSERVADA" significa categoria A → Adequação capturada entre sincronizações; "INVESTIGAR" é candidato sem categoria inicial recuperada. `HUB_LEGACY` não é a categoria na abertura.
8. **Vistra:** conferir somente as linhas `VISTRA` para o total explícito da ferramenta; `ANALITICO` e `RELATORIO_SIMER` têm blocos próprios.
9. **Recorrências:** conferir agrupamentos por Task e por assunto. Grupos podem se sobrepor; utilizar o indicador de **tickets únicos** na contagem geral.
10. **Excel:** o botão `Exportar Excel` deve baixar `relatorio-bom-jesus-<inicio>-<fim>.xlsx` contendo "PAINEL DIRETORIA", "OLA SUPORTE AUDITORIA", "QUALIDADE CORRECOES", "MATRIZ CLASSIFICACOES", "AUDITORIA ADEQUACOES", "RECORRENCIAS CANDIDATAS", "VISTRA ANALITICO RELATORIOS", "EVOLUCAO MENSAL" e "PLANO DE ACAO", além das abas anteriores.

## Testes no ambiente de desenvolvimento (PowerShell)
```powershell
cd C:\Users\TAYSON.ARAUJO\Documents\techlead-hub-dashboard-dev
git status
git fetch origin feat/coordination-weekly-workspace
git switch feat/coordination-weekly-workspace
git pull --ff-only origin feat/coordination-weekly-workspace

cd backend
npm ci
npm run prisma:migrate:deploy
npm run build
npm test

cd ..\frontend
npm ci
npm run build
npm test
npm run lint
```

**Atenção:** não descarte mudanças locais não commitadas. Execute migrações primeiramente contra banco de **desenvolvimento** e faça backup, se necessário.

## Limites e próximas evoluções (não são resultados comprovados)
- Pausas sem histórico contínuo, alterações de urgência e feriados locais podem alterar o OLA final. Os alertas são preliminares.
- A API pública Movidesk **não expõe `categoryHistories`**. Histórico anterior à captura deve ser consultado na interface ou em outros arquivos históricos existentes.
- Aceite do cliente e data efetiva da implantação da versão só devem ser reconhecidos com evidência explícita.
- Não executar alterações de Tickets nem Tasks para gerar esse relatório; operação somente leitura.
