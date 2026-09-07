export type MetricDefinition = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference: string;
  periodRule: string;
  notes?: string;
};

export const metricDefinitions = {
  abertos: {
    title: "Abertos",
    summary: "Quantidade de tickets abertos dentro do período selecionado.",
    calculation: "Conta os tickets cuja data de abertura está entre o início e o fim do período.",
    source: "Movidesk",
    reference: "Aberto em / createdDate",
    periodRule: "Data de abertura dentro do período selecionado.",
  },
  pendentes: {
    title: "Pendentes",
    summary: "Backlog atual de tickets que permanecem ativos.",
    calculation: "Conta os tickets atualmente classificados pelo TechLead Hub como abertos.",
    source: "Movidesk + classificação de status do TechLead Hub",
    reference: "Status / baseStatus",
    periodRule: "Não é limitado pela data de abertura; representa o backlog atual.",
  },
  resolvidos: {
    title: "Resolvidos",
    summary: "Quantidade de tickets resolvidos dentro do período selecionado.",
    calculation: "Conta os tickets cuja data de resolução está dentro do período.",
    source: "Movidesk",
    reference: "Resolvido em / resolvedDate",
    periodRule: "Data de resolução dentro do período selecionado.",
  },
  fechados: {
    title: "Fechados",
    summary: "Quantidade de tickets fechados dentro do período selecionado.",
    calculation: "Conta os tickets cuja data de fechamento está dentro do período.",
    source: "Movidesk",
    reference: "Fechado em / closedDate",
    periodRule: "Data de fechamento dentro do período selecionado.",
  },
  slaResposta: {
    title: "SLA 1ª Resposta",
    summary: "Percentual dos tickets medidos que cumpriram o SLA de primeira resposta.",
    calculation: "No prazo ÷ (No prazo + Fora do prazo) × 100.",
    source: "Indicador do SLA de Resposta do Movidesk; quando aplicável, motor de SLA do TechLead Hub.",
    reference: "Indicador do SLA de Resposta / vencimento e data da primeira resposta",
    periodRule: "População de tickets abertos no período selecionado.",
    notes: "Tickets classificados como sem medição não entram no denominador do percentual.",
  },
  slaSolucao: {
    title: "SLA Solução",
    summary: "Percentual dos tickets medidos que cumpriram o SLA de solução.",
    calculation: "No prazo ÷ (No prazo + Fora do prazo) × 100.",
    source: "Indicador do SLA de Solução do Movidesk; quando aplicável, motor de SLA do TechLead Hub.",
    reference: "Indicador do SLA de Solução / vencimento e conclusão",
    periodRule: "População concluída no período, considerando resolução e fechamento sem duplicidade.",
    notes: "Tickets classificados como sem medição não entram no denominador do percentual.",
  },
  criticos: {
    title: "Críticos",
    summary: "Tickets pendentes cuja urgência atual é crítica.",
    calculation: 'Conta tickets do backlog atual em que a urgência normalizada é "Crítica".',
    source: "Movidesk",
    reference: "Urgência + status atual",
    periodRule: "Backlog atual; não é limitado pela data de abertura.",
  },
  parados: {
    title: "Parados",
    summary: "Tickets pendentes atualmente classificados em situação de parada.",
    calculation: 'Conta tickets do backlog atual cujo baseStatus é "Stopped".',
    source: "Movidesk + normalização de status do TechLead Hub",
    reference: "Status / baseStatus",
    periodRule: "Backlog atual; não é limitado pela data de abertura.",
    notes: "A classificação depende do status importado e da normalização aplicada pelo TechLead Hub.",
  },
} satisfies Record<string, MetricDefinition>;

export type MetricDefinitionKey = keyof typeof metricDefinitions;
