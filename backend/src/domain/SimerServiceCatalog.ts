export type SimerServiceCatalogItem = {
  id: string;
  path: string;
  name: string;
  module: string | null;
};

/*
 * Catálogo de fallback.
 *
 * A fonte principal para a auditoria é o próprio histórico sincronizado do
 * Movidesk (serviços já usados nos tickets SIMER). Estes registros cobrem o
 * catálogo real do ambiente sem duplicarmos centenas de opções manualmente
 * no código. A lista abaixo permanece como seed para serviços importantes que
 * ainda não tenham aparecido no histórico local.
 */
export const SIMER_SERVICE_CATALOG: readonly SimerServiceCatalogItem[] = [
  { id: "797250", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » ARMAZENAGEM DE GRÃOS", name: "ARMAZENAGEM DE GRÃOS", module: "ARMAZENAGEM DE GRÃOS" },
  { id: "797645", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » ARMAZENAGEM DE GRÃOS » AUTORIZAÇÃO DE TRANSFERÊNCIA DE GRÃOS", name: "AUTORIZAÇÃO DE TRANSFERÊNCIA DE GRÃOS", module: "ARMAZENAGEM DE GRÃOS" },
  { id: "1223507", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » ARMAZENAGEM DE GRÃOS » BAIXA DE CONTRATO DE LENHA", name: "BAIXA DE CONTRATO DE LENHA", module: "ARMAZENAGEM DE GRÃOS" },
  { id: "797637", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » ARMAZENAGEM DE GRÃOS » BLOQUEIO DE OPERAÇÃO AGRÍCOLA", name: "BLOQUEIO DE OPERAÇÃO AGRÍCOLA", module: "ARMAZENAGEM DE GRÃOS" },
  { id: "manual-financial-programming", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » FINANCEIRO » PROGRAMAÇÃO FINANCEIRA", name: "PROGRAMAÇÃO FINANCEIRA", module: "FINANCEIRO" },
  { id: "manual-contract-sale", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » CONTRATOS » CONTRATO DE VENDA", name: "CONTRATO DE VENDA", module: "CONTRATOS" },
  { id: "manual-receituario-agriq", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » INSUMOS » RECEITUÁRIO AGRONÔMICO AGRIQ AVULSO", name: "RECEITUÁRIO AGRONÔMICO AGRIQ AVULSO", module: "INSUMOS" },
  { id: "manual-romaneio", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » ARMAZENAGEM DE GRÃOS » ROMANEIO", name: "ROMANEIO", module: "ARMAZENAGEM DE GRÃOS" },
  { id: "manual-nfe", path: "ATENDIMENTO AO CLIENTE » SIAGRI SIMER » FATURAMENTO » NOTA FISCAL ELETRÔNICA", name: "NOTA FISCAL ELETRÔNICA", module: "FATURAMENTO" },
];

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const STOP_WORDS = new Set([
  "atendimento", "cliente", "siagri", "simer", "de", "da", "do", "das", "dos",
  "e", "em", "para", "por", "com", "sem", "um", "uma", "a", "o",
]);

function words(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

export type SimerServiceSuggestion = {
  path: string;
  service: string;
  module: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  evidence: string[];
  reasons: string[];
  alternatives: Array<{ path: string; service: string; score: number }>;
};

export function suggestSimerService(input: {
  subject?: string | null;
  category?: string | null;
  cause?: string | null;
  currentService?: string | null;
  serviceFirstLevel?: string | null;
  serviceSecondLevel?: string | null;
  serviceThirdLevel?: string | null;
}, catalog: readonly SimerServiceCatalogItem[] = SIMER_SERVICE_CATALOG): SimerServiceSuggestion | null {
  const source = [input.subject, input.category, input.cause].filter(Boolean).join(" ");
  const sourceWords = new Set(words(source));
  if (!sourceWords.size) return null;

  const currentPath = [input.serviceFirstLevel, input.serviceSecondLevel, input.serviceThirdLevel]
    .filter(Boolean).join(" » ") || input.currentService || "";
  const currentWords = new Set(words(currentPath));

  const ranked = catalog.map((item) => {
    const itemWords = [...new Set(words(item.path))];
    const matches = itemWords.filter((word) => sourceWords.has(word));
    const currentOverlap = itemWords.filter((word) => currentWords.has(word));
    const specificity = item.path.split("»").length;
    const exactPhraseBonus = itemWords.some((word) => normalize(input.subject ?? "").includes(word)) ? 1 : 0;
    const score = matches.length * 4 + Math.min(currentOverlap.length, 2) + (specificity >= 4 ? 2 : 0) + exactPhraseBonus;
    return { item, score, matches, currentOverlap };
  })
    .filter((entry) => entry.score >= 7 && entry.matches.length >= 1)
    .sort((a, b) => b.score - a.score || b.matches.length - a.matches.length);

  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];

  const normalizedCurrent = normalize(currentPath);
  const normalizedSuggested = normalize(best.item.path);
  if (normalizedCurrent && (normalizedSuggested === normalizedCurrent || normalizedSuggested.includes(normalizedCurrent)) && normalizedCurrent.length > 20) {
    return null;
  }

  const margin = second ? best.score - second.score : best.score;
  const confidence: SimerServiceSuggestion["confidence"] =
    best.score >= 15 && margin >= 4 ? "HIGH" :
    best.score >= 10 && margin >= 2 ? "MEDIUM" : "LOW";

  const reasons = [
    best.matches.length ? `Termos coincidentes: ${best.matches.slice(0, 6).join(", ")}.` : null,
    best.currentOverlap.length ? `Há proximidade com a classificação atual em: ${best.currentOverlap.slice(0, 4).join(", ")}.` : null,
    second ? `Diferença de ${margin} ponto(s) para a segunda opção.` : "Não houve segunda opção com evidência suficiente.",
  ].filter((value): value is string => Boolean(value));

  return {
    path: best.item.path,
    service: best.item.name,
    module: best.item.module,
    confidence,
    score: best.score,
    evidence: best.matches.slice(0, 6),
    reasons,
    alternatives: ranked.slice(1, 4).map((entry) => ({
      path: entry.item.path,
      service: entry.item.name,
      score: entry.score,
    })),
  };
}
