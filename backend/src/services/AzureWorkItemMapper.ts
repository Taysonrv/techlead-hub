import { Prisma } from "@prisma/client";

/**
 * Campos customizados identificados no projeto SIMER do Azure DevOps.
 *
 * Centralizamos os reference names aqui porque vários campos customizados
 * possuem identificadores GUID.
 */
export const AZURE_WORK_ITEM_FIELDS = {
  version: "Custom.86c406e1-621a-4216-8978-6d8b80c98737",
  workaround: "Custom.250bc342-0d60-4543-89ce-cd25338209da",
  correctionType: "Custom.362d5b2b-02aa-4283-8897-5f04c8e0a52b",
  technicalSolution: "Custom.a3c2ec46-d02c-4249-9a5c-b70c66f8de84",
  module: "Custom.d18cb8ca-251f-43d4-8d6b-08767bb26ac8",
  process: "Custom.ed12cd53-be03-4ba3-a29a-d7c17d98221c",
  movideskTicket: "Custom.fc7510e1-3e57-49e4-9980-828b506c14ee",

  client: "Custom.ClientePrincipal",
  criticality: "Custom.Criticidade",
  origin: "Custom.Origem",
  detectedIn: "Custom.Detectadoem",

  prioritized: "Custom.Priorizada",
  blockedProcess: "Custom.ProcessoBloqueado",
  impactScale: "Custom.EscaladeImpacto",

  defectType: "Custom.TipodeDefeito",
  branchType: "Custom.BranchType",
  rdmNumber: "Custom.RDMGeradoradoerro",
  slaLimit: "Custom.LimiteSLA",
} as const;

type AzureIdentity = {
  displayName?: unknown;
  uniqueName?: unknown;
  id?: unknown;
};

export type AzureDevOpsWorkItemResponse = {
  id?: unknown;
  rev?: unknown;

  fields?: Record<string, unknown>;

  relations?: unknown[];

  url?: unknown;

  _links?: {
    html?: {
      href?: unknown;
    };
  };
};

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) {
      return value;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized === "sim" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "1"
  ) {
    return true;
  }

  if (
    normalized === "nao" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "0"
  ) {
    return false;
  }

  return null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function identityValue(value: unknown): {
  name: string | null;
  email: string | null;
  id: string | null;
} {
  if (!value || typeof value !== "object") {
    return {
      name: null,
      email: null,
      id: null,
    };
  }

  const identity = value as AzureIdentity;

  return {
    name: stringValue(identity.displayName),
    email: stringValue(identity.uniqueName),
    id: stringValue(identity.id),
  };
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function getParentId(
  fields: Record<string, unknown>,
  relations: unknown[] | undefined,
): number | null {
  const systemParent = integerValue(fields["System.Parent"]);

  if (systemParent !== null) {
    return systemParent;
  }

  if (!Array.isArray(relations)) {
    return null;
  }

  for (const relation of relations) {
    if (!relation || typeof relation !== "object") {
      continue;
    }

    const candidate = relation as {
      rel?: unknown;
      url?: unknown;
    };

    if (candidate.rel !== "System.LinkTypes.Hierarchy-Reverse") {
      continue;
    }

    const url = stringValue(candidate.url);

    if (!url) {
      continue;
    }

    const match = url.match(/\/workItems\/(\d+)(?:$|\?)/i);

    if (!match) {
      continue;
    }

    const id = integerValue(match[1]);

    if (id !== null) {
      return id;
    }
  }

  return null;
}

function getRemoteUrl(workItem: AzureDevOpsWorkItemResponse): string | null {
  const htmlUrl = stringValue(workItem._links?.html?.href);

  if (htmlUrl) {
    return htmlUrl;
  }

  return stringValue(workItem.url);
}

function requiredString(
  fields: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  return stringValue(fields[key]) ?? fallback;
}

export function mapAzureWorkItem(
  workItem: AzureDevOpsWorkItemResponse,
  syncRunId?: number | null,
): Prisma.AzureWorkItemUncheckedCreateInput {
  const id = integerValue(workItem.id);

  if (id === null) {
    throw new Error("Azure Work Item sem System.Id válido.");
  }

  const fields = workItem.fields ?? {};

  const assignedTo = identityValue(fields["System.AssignedTo"]);
  const createdBy = identityValue(fields["System.CreatedBy"]);
  const changedBy = identityValue(fields["System.ChangedBy"]);

  const workItemType = requiredString(
    fields,
    "System.WorkItemType",
    "Não informado",
  );

  const title = requiredString(
    fields,
    "System.Title",
    `Azure Work Item #${id}`,
  );

  const state = requiredString(
    fields,
    "System.State",
    "Não informado",
  );

  const revision =
    integerValue(workItem.rev) ??
    integerValue(fields["System.Rev"]);

  const rawRelations = Array.isArray(workItem.relations)
    ? workItem.relations
    : [];

  return {
    id,
    revision,

    workItemType,
    title,
    state,

    reason: stringValue(fields["System.Reason"]),

    assignedToName: assignedTo.name,
    assignedToEmail: assignedTo.email,
    assignedToId: assignedTo.id,

    createdByName: createdBy.name,
    createdByEmail: createdBy.email,

    changedByName: changedBy.name,
    changedByEmail: changedBy.email,

    areaPath: stringValue(fields["System.AreaPath"]),
    iterationPath: stringValue(fields["System.IterationPath"]),
    nodeName: stringValue(fields["System.NodeName"]),
    boardColumn:
      stringValue(fields["System.BoardColumn"]) ??
      stringValue(fields["System.BoardColumnDone"]),

    client: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.client],
    ),

    criticality: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.criticality],
    ),

    origin: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.origin],
    ),

    detectedIn: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.detectedIn],
    ),

    module: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.module],
    ),

    process: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.process],
    ),

    movideskTicket: integerValue(
      fields[AZURE_WORK_ITEM_FIELDS.movideskTicket],
    ),

    deliveredVersion: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.version],
    ),

    prioritized: booleanValue(
      fields[AZURE_WORK_ITEM_FIELDS.prioritized],
    ),

    blockedProcess: booleanValue(
      fields[AZURE_WORK_ITEM_FIELDS.blockedProcess],
    ),

    impactScale: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.impactScale],
    ),

    defectType: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.defectType],
    ),

    branchType: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.branchType],
    ),

    correctionType: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.correctionType],
    ),

    rdmNumber: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.rdmNumber],
    ),

    slaLimit: dateValue(
      fields[AZURE_WORK_ITEM_FIELDS.slaLimit],
    ),

    parentId: getParentId(fields, rawRelations),

    description: stringValue(
      fields["System.Description"],
    ),

    workaround: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.workaround],
    ),

    technicalSolution: stringValue(
      fields[AZURE_WORK_ITEM_FIELDS.technicalSolution],
    ),

    tags: stringValue(fields["System.Tags"]),

    azureCreatedAt: dateValue(
      fields["System.CreatedDate"],
    ),

    azureChangedAt: dateValue(
      fields["System.ChangedDate"],
    ),

    azureClosedAt: dateValue(
      fields["Microsoft.VSTS.Common.ClosedDate"],
    ),

    stateChangedAt: dateValue(
      fields["Microsoft.VSTS.Common.StateChangeDate"],
    ),

    activatedAt: dateValue(
      fields["Microsoft.VSTS.Common.ActivatedDate"],
    ),

    remoteUrl: getRemoteUrl(workItem),

    rawFields: jsonValue(fields),
    rawRelations: jsonValue(rawRelations),

    syncRunId: syncRunId ?? null,

    syncedAt: new Date(),
  };
}