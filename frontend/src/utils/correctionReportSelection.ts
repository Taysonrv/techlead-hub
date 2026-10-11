export const CORRECTION_METRICS = ["registered", "delivered", "canceled", "registration", "backlogInitial", "backlogCurrent"] as const;
export type CorrectionMetric = typeof CORRECTION_METRICS[number];
export type CorrectionSlice =
  | { kind: "status" | "urgency"; value: string }
  | { kind: "prioritized"; value: boolean | null }
  | { kind: "monthly" };

export type CorrectionReportSelection = {
  month: string;
  creators: string[];
  clients: string[];
  urgencies: string[];
  states: string[];
  prioritized: "" | "true" | "false";
  search: string;
  metric: CorrectionMetric | null;
  slice: CorrectionSlice | null;
  taskId: number | null;
};

/** Namespaced parameters leave the operational page's own task filters intact. */
export function parseCorrectionReportSelection(search: string, defaultMonth: string): CorrectionReportSelection {
  const params = new URLSearchParams(search);
  const rawMonth = params.get("reportMonth") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : defaultMonth;
  const values = (key: string) => [...new Set(params.getAll(key).map(value => value.trim()).filter(value => value && value.length <= 240))].slice(0, 30);
  const rawPriority = params.get("reportPrioritized");
  const rawMetric = params.get("reportMetric");
  const metric = CORRECTION_METRICS.find(value => value === rawMetric) ?? null;
  const kind = params.get("reportSlice");
  const value = params.get("reportValue");
  let slice: CorrectionSlice | null = null;
  if (!metric) {
    if (kind === "monthly") slice = { kind };
    else if ((kind === "status" || kind === "urgency") && value && value.length <= 240) slice = { kind, value };
    else if (kind === "prioritized" && ["true", "false", "unknown"].includes(value ?? ""))
      slice = { kind, value: value === "unknown" ? null : value === "true" };
  }
  const rawTask = params.get("reportTask") ?? "";
  const taskId = /^\d+$/.test(rawTask) && Number.isSafeInteger(Number(rawTask)) && Number(rawTask) > 0 ? Number(rawTask) : null;
  return { month, creators: values("reportCreator"), clients: values("reportClient"), urgencies: values("reportUrgency"), states: values("reportState"),
    prioritized: rawPriority === "true" || rawPriority === "false" ? rawPriority : "", search: (params.get("reportSearch") ?? "").slice(0, 500), metric, slice, taskId };
}

export function correctionReportLink(selection: CorrectionReportSelection): string {
  const params = new URLSearchParams({ reportMonth: selection.month });
  for (const [key, values] of [["reportCreator", selection.creators], ["reportClient", selection.clients], ["reportUrgency", selection.urgencies], ["reportState", selection.states]] as const)
    for (const value of values) params.append(key, value);
  if (selection.prioritized) params.set("reportPrioritized", selection.prioritized);
  if (selection.search) params.set("reportSearch", selection.search);
  if (selection.metric) params.set("reportMetric", selection.metric);
  else if (selection.slice) {
    params.set("reportSlice", selection.slice.kind);
    if (selection.slice.kind !== "monthly") params.set("reportValue", selection.slice.kind === "prioritized"
      ? selection.slice.value === null ? "unknown" : String(selection.slice.value) : selection.slice.value);
  }
  if (selection.taskId !== null) params.set("reportTask", String(selection.taskId));
  return `/correcoes?${params.toString()}`;
}
