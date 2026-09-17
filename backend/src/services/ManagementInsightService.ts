export type ManagementInsight = {
  priority: "ALTA" | "MÉDIA" | "POSITIVA" | "INFORMATIVA";
  topic: string;
  finding: string;
  recommendation: string;
};

export type ManagementInsightInput = {
  ticketsTotal: number;
  ticketsOpen: number;
  ticketsResolved: number;
  ticketsClosed: number;
  slaMeasured: number;
  slaMet: number;
  corrections: number;
  evolutions: number;
  supports: number;
  prioritized: number;
  blocked: number;
  topCategory?: { label: string; total: number } | null;
  topAnalyst?: { label: string; total: number } | null;
  topVersion?: { label: string; total: number } | null;
  reopened?: number;
  firstCallResolved?: number;
  firstCallMeasured?: number;
  excessiveHandoffs?: number;
  satisfactionMeasured?: number;
  lowSatisfaction?: number;
};

export function buildManagementInsights(input: ManagementInsightInput): ManagementInsight[] {
  const percent = (value: number, total: number) =>
    total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  const openRate = percent(input.ticketsOpen, input.ticketsTotal);
  const slaRate = percent(input.slaMet, input.slaMeasured);
  const measuredRate = percent(input.slaMeasured, input.ticketsTotal);
  const developmentTotal = input.corrections;
  const insights: ManagementInsight[] = [];

  insights.push({
    priority: openRate >= 30 ? "ALTA" : openRate >= 15 ? "MÉDIA" : "POSITIVA",
    topic: "Carteira de atendimentos",
    finding: `${input.ticketsOpen} de ${input.ticketsTotal} tickets permanecem abertos (${openRate.toFixed(1)}%).`,
    recommendation: openRate >= 30
      ? "Executar plano de redução do backlog, priorizando idade, criticidade e bloqueio operacional."
      : "Manter revisão recorrente da carteira e acompanhar crescimento por categoria e responsável.",
  });

  insights.push({
    priority: slaRate < 80 ? "ALTA" : slaRate < 90 ? "MÉDIA" : "POSITIVA",
    topic: "Cumprimento de SLA",
    finding: `${slaRate.toFixed(1)}% dos ${input.slaMeasured} tickets medidos ficaram dentro do prazo; cobertura de medição de ${measuredRate.toFixed(1)}%.`,
    recommendation: measuredRate < 90
      ? "Revisar tickets sem indicador de SLA antes de usar o percentual em decisões executivas."
      : slaRate < 90
        ? "Analisar categorias e responsáveis com maior concentração de estouros."
        : "Preservar o acompanhamento e registrar as práticas que sustentam o resultado.",
  });

  if (input.topCategory) {
    insights.push({
      priority: percent(input.topCategory.total, input.ticketsTotal) >= 25 ? "MÉDIA" : "INFORMATIVA",
      topic: "Principal causa de demanda",
      finding: `${input.topCategory.label} concentra ${input.topCategory.total} tickets (${percent(input.topCategory.total, input.ticketsTotal).toFixed(1)}%).`,
      recommendation: "Avaliar causa raiz, documentação, treinamento e oportunidades de prevenção para o tema.",
    });
  }

  insights.push({
    priority: input.blocked > 0 ? "ALTA" : input.prioritized > 0 ? "MÉDIA" : "INFORMATIVA",
    topic: "Correções de suporte",
    finding: `${developmentTotal} correção(ões) de suporte e sustentação; ${input.prioritized} priorizada(s) e ${input.blocked} com processo bloqueado. Evoluções e APOIOs não compõem o relatório.`,
    recommendation: input.blocked > 0
      ? "Tratar imediatamente os itens com processo bloqueado e comunicar responsáveis, impacto e previsão."
      : "Acompanhar priorizados até a entrega e validar o retorno ao atendimento de origem.",
  });

  if (input.topAnalyst) {
    insights.push({
      priority: percent(input.topAnalyst.total, input.ticketsTotal) >= 35 ? "MÉDIA" : "INFORMATIVA",
      topic: "Distribuição da operação",
      finding: `${input.topAnalyst.label} responde por ${input.topAnalyst.total} tickets (${percent(input.topAnalyst.total, input.ticketsTotal).toFixed(1)}%).`,
      recommendation: "Validar equilíbrio da carteira considerando complexidade, idade e especialidade, não apenas volume.",
    });
  }

  if ((input.reopened ?? 0) > 0 || (input.firstCallMeasured ?? 0) > 0) {
    const firstCallRate = percent(input.firstCallResolved ?? 0, input.firstCallMeasured ?? 0);
    insights.push({
      priority: (input.reopened ?? 0) > Math.max(3, input.ticketsTotal * 0.1) ? "MÉDIA" : "INFORMATIVA",
      topic: "Efetividade da solução",
      finding: `${input.reopened ?? 0} atendimento(s) reaberto(s); resolução no primeiro contato de ${firstCallRate.toFixed(1)}% entre ${input.firstCallMeasured ?? 0} registros medidos.`,
      recommendation: "Revisar causas de reabertura e transformar soluções recorrentes em procedimento ou base de conhecimento.",
    });
  }

  if ((input.excessiveHandoffs ?? 0) > 0) {
    insights.push({
      priority: "MÉDIA",
      topic: "Continuidade do atendimento",
      finding: `${input.excessiveHandoffs} atendimento(s) tiveram três ou mais trocas de responsável.`,
      recommendation: "Revisar roteamento, especialidades e definição do responsável principal.",
    });
  }

  if ((input.satisfactionMeasured ?? 0) > 0) {
    insights.push({
      priority: (input.lowSatisfaction ?? 0) > 0 ? "ALTA" : "POSITIVA",
      topic: "Experiência do cliente",
      finding: `${input.satisfactionMeasured} avaliação(ões) recebida(s), com ${input.lowSatisfaction ?? 0} nota(s) baixa(s).`,
      recommendation: (input.lowSatisfaction ?? 0) > 0
        ? "Analisar os históricos com avaliação baixa e registrar plano de recuperação com o cliente."
        : "Manter o acompanhamento e ampliar a cobertura das pesquisas de satisfação.",
    });
  }

  if (input.topVersion) {
    insights.push({
      priority: "INFORMATIVA",
      topic: "Entregas por versão",
      finding: `${input.topVersion.label} é a versão mais citada, com ${input.topVersion.total} itens entregues no recorte.`,
      recommendation: "Cruzar a versão com aceite do cliente e encerramento dos tickets relacionados.",
    });
  }

  return insights;
}
