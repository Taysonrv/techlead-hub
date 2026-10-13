import type {
  Prisma,
} from "@prisma/client";

/**
 * Fonte única de verdade do escopo operacional do TechLead Hub.
 *
 * Os valores correspondem exatamente aos nomes recebidos nas
 * integrações atuais do Movidesk e do Azure DevOps. A comparação
 * é case-insensitive para tolerar diferenças apenas de capitalização.
 */
export const SIMER_CLIENTS = [
  "BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",
  "CAMP - PRUDENTOPOLIS-PR",
  "COAGRO - CAPANEMA-PR",
  "COAP - SORRISO-MT",
  "COOAZUL - COOPERATIVA AGROINDUSTRIAL VALE DO AZUL - SANTA CARMEM-MT",
  "COOPERATIVA AGROPECUARIA COMAG - CURITIBA-PR",
  "COPERAMA - ITURAMA-MG",
] as const;

const SIMER_CLIENT_ALIASES: ReadonlyArray<{
  canonical: (typeof SIMER_CLIENTS)[number];
  aliases: readonly string[];
}> = [
  {
    canonical: "BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",
    aliases: ["BOM JESUS", "COOPERATIVA BOM JESUS - LAPA-PR"],
  },
  {
    canonical: "CAMP - PRUDENTOPOLIS-PR",
    aliases: ["CAMP"],
  },
  {
    canonical: "COAGRO - CAPANEMA-PR",
    aliases: ["COAGRO"],
  },
  {
    canonical: "COAP - SORRISO-MT",
    aliases: ["COAP"],
  },
  {
    canonical: "COOAZUL - COOPERATIVA AGROINDUSTRIAL VALE DO AZUL - SANTA CARMEM-MT",
    aliases: ["COOAZUL", "VALE DO AZUL"],
  },
  {
    canonical: "COOPERATIVA AGROPECUARIA COMAG - CURITIBA-PR",
    aliases: ["COMAG", "COOPERATIVA AGROPECUARIA COMAG"],
  },
  {
    canonical: "COPERAMA - ITURAMA-MG",
    aliases: ["COPERAMA"],
  },
] as const;

function normalizeClientScopeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

export function resolveSimerClient(
  value: string | null | undefined,
): (typeof SIMER_CLIENTS)[number] | null {
  if (!value?.trim()) return null;

  const normalized = normalizeClientScopeValue(value);

  const exact = SIMER_CLIENTS.find(
    (client) => normalizeClientScopeValue(client) === normalized,
  );
  if (exact) return exact;

  const aliasMatch = SIMER_CLIENT_ALIASES.find(({ aliases }) =>
    aliases.some((alias) => {
      const token = normalizeClientScopeValue(alias);
      return normalized === token;
    }),
  );

  return aliasMatch?.canonical ?? null;
}

export const SIMER_CLIENT_SCOPE_NAMES = [...new Set([...SIMER_CLIENTS, ...SIMER_CLIENT_ALIASES.flatMap(({ aliases }) => aliases)])];

export const OPERATIONAL_SCOPE_START = new Date("2026-01-01T00:00:00.000Z");
export const SUPPORT_COORDINATOR = "WELLINGTON ALVES GOLD" as const;

export const SUPPORT_ANALYSTS = [
  "ALAN KARDEK DA SILVA BARROS NETO",
  "DÉBORA DAL CORREIA",
  "DIEGO OLIVEIRA ARANTES",
  "LUIZ ANTÔNIO COSTA CUNHA",
  "RENAN BRENO CARVALHO",
  "TAYSON ALVES DE ARAUJO",
  "THIAGO DE LIMA MACHADO",
] as const;

export const SUPPORT_TEAMS = {
  "Suporte N1": ["DÉBORA DAL CORREIA", "THIAGO DE LIMA MACHADO", "TAYSON ALVES DE ARAUJO"],
  "Suporte N2": ["TAYSON ALVES DE ARAUJO", "LUIZ ANTÔNIO COSTA CUNHA"],
  "Suporte N3": ["TAYSON ALVES DE ARAUJO", "RENAN BRENO CARVALHO"],
  "Legislação N1": ["ALAN KARDEK DA SILVA BARROS NETO", "TAYSON ALVES DE ARAUJO"],
  "Legislação N2": ["ALAN KARDEK DA SILVA BARROS NETO", "TAYSON ALVES DE ARAUJO"],
  "Legislação N3": ["ALAN KARDEK DA SILVA BARROS NETO", "TAYSON ALVES DE ARAUJO"],
  "Coordenação": [SUPPORT_COORDINATOR],
} as const;

export type SupportTeamName = keyof typeof SUPPORT_TEAMS;

export const SUPPORT_OPERATIONAL_MEMBERS = [
  ...SUPPORT_ANALYSTS,
  SUPPORT_COORDINATOR,
] as const;

export function simerClientTicketScope(): Prisma.TicketWhereInput {
  return {
    AND: [
      {
        createdDate: { gte: OPERATIONAL_SCOPE_START },
      },
      {
        client: {
          in: [...SIMER_CLIENTS],
          mode: "insensitive",
        },
      },
    ],
  };
}

/**
 * Escopo principal das telas Movidesk: somente atendimentos criados a partir
 * de 01/01/2026 e pertencentes aos clientes da carteira SIMER.
 * Cliente, produto e responsável precisam pertencer à carteira operacional.
 */

export const SIMER_EXCLUDED_PRODUCTS = ["AGB", "CLOVER", "SIAGRI WEB"] as const;

export function simerSupportTicketScope(includeDeleted = false): Prisma.TicketWhereInput {
  return {
    AND: [
      simerClientTicketScope(),
      { owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
      ...(includeDeleted ? [] : [{ isDeleted: false }]),
      {
        NOT: {
          OR: SIMER_EXCLUDED_PRODUCTS.flatMap((product) => [
            { service: { contains: product, mode: "insensitive" as const } },
            { serviceFirstLevel: { contains: product, mode: "insensitive" as const } },
            { serviceSecondLevel: { contains: product, mode: "insensitive" as const } },
            { serviceThirdLevel: { contains: product, mode: "insensitive" as const } },
            { ownerTeam: { contains: product, mode: "insensitive" as const } },
          ]),
        },
      },
      {
        OR: [
          { service: { contains: "SIMER", mode: "insensitive" } },
          { serviceFirstLevel: { contains: "SIMER", mode: "insensitive" } },
          { serviceSecondLevel: { contains: "SIMER", mode: "insensitive" } },
          { serviceThirdLevel: { contains: "SIMER", mode: "insensitive" } },
          { ownerTeam: { contains: "SIMER", mode: "insensitive" } },
        ],
      },
    ],
  };
}

export function ticketOperationalScope(includeDeleted = false): Prisma.TicketWhereInput {
  return simerSupportTicketScope(includeDeleted);
}

/** A Coordenação usa a mesma carteira estrita das demais telas. */
export function coordinationTicketScope(): Prisma.TicketWhereInput {
  return ticketOperationalScope();
}

/**
 * No Azure, Cliente Principal pode representar o cliente final da
 * ocorrência, e Assigned To normalmente é um desenvolvedor.
 * O campo confiável para delimitar a origem da demanda é Created By.
 */
export const AZURE_SUPPORT_CREATORS = [
  ...SUPPORT_ANALYSTS,
  ...SUPPORT_ANALYSTS.map((name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
  "Alan Neto", "Renan Sousa", "Tayson Araujo",
] as const;

/** Identidade do criador, sem confundir pessoas com nomes parecidos. */
export function resolveSupportCreator(value: string | null | undefined): string | null {
  const normalized = normalizeClientScopeValue(value ?? "");
  const fullName = SUPPORT_ANALYSTS.find(name => normalizeClientScopeValue(name) === normalized);
  if (fullName) return fullName;
  const aliases: Record<string, string> = {
    "ALAN NETO": SUPPORT_ANALYSTS[0],
    "RENAN SOUSA": SUPPORT_ANALYSTS[4],
    "TAYSON ARAUJO": SUPPORT_ANALYSTS[5],
  };
  return aliases[normalized] ?? null;
}

export function supportCreatorNames(value: string): string[] {
  const canonical = resolveSupportCreator(value);
  return canonical ? [...new Set(AZURE_SUPPORT_CREATORS.filter(name => resolveSupportCreator(name) === canonical))] : [];
}

export function azureOperationalScope(): Prisma.AzureWorkItemWhereInput {
  return {
    AND: [
      { client: { in: SIMER_CLIENT_SCOPE_NAMES, mode: "insensitive" } },
      { createdByName: { in: [...AZURE_SUPPORT_CREATORS], mode: "insensitive" } },
      { workItemType: { in: ["Correção Clientes", "Evolução", "APOIO"], mode: "insensitive" } },
    ],
  };
}

export function coordinationAzureScope(): Prisma.AzureWorkItemWhereInput {
  return azureOperationalScope();
}

/** Os filtros opcionais apenas restringem a carteira obrigatória. */
export function scopedTicketWhere(where: Prisma.TicketWhereInput = {}, includeDeleted = false): Prisma.TicketWhereInput {
  return { AND: [ticketOperationalScope(includeDeleted), where] };
}

export function scopedAzureWhere(where: Prisma.AzureWorkItemWhereInput = {}): Prisma.AzureWorkItemWhereInput {
  return { AND: [azureOperationalScope(), where] };
}

export function isSupportAnalyst(
  value:
    string |
    null |
    undefined,
) {
  const normalized =
    value
      ?.trim()
      .toLocaleUpperCase(
        "pt-BR",
      );

  return Boolean(
    normalized &&
    SUPPORT_ANALYSTS.some(
      (
        analyst,
      ) =>
        analyst.toLocaleUpperCase(
          "pt-BR",
        ) ===
        normalized,
    ),
  );
}


export function isSimerOperationalTeam(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (!normalized) return false;

  const hasSimer = normalized.includes("SIMER");
  const isSupportLevel = /SUPORTE(?:\s*\|\s*|\s*-\s*|\s*\/\s*|\s+)N[123]/.test(normalized)
    || /N[123](?:\s*\|\s*|\s*-\s*|\s*\/\s*|\s+)SUPORTE/.test(normalized);
  const isLegalLevel = /LEGISLACAO(?:\s*\|\s*|\s*-\s*|\s*\/\s*|\s+)N[123]/.test(normalized)
    || /N[123](?:\s*\|\s*|\s*-\s*|\s*\/\s*|\s+)LEGISLACAO/.test(normalized);
  const isBds = /\bBDS\b|BANCO DE DADOS/.test(normalized);

  return (
    (hasSimer && (isSupportLevel || isLegalLevel || isBds)) ||
    normalized.includes("SIMER | SUPORTE") ||
    normalized.includes("SIMER - SUPORTE") ||
    normalized.includes("SIMER / SUPORTE") ||
    normalized.includes("SIMER | LEGISLACAO") ||
    normalized.includes("SIMER - LEGISLACAO") ||
    normalized.includes("SIMER / LEGISLACAO") ||
    normalized === "SUPORTE SIMER" ||
    normalized === "SIMER"
  );
}

export function isSimerOperationalResponsibility(owner: string | null | undefined, _ownerTeam: string | null | undefined) {
  return isSupportAnalyst(owner);
}

export function isSimerClient(
  value:
    string |
    null |
    undefined,
) {
  return resolveSimerClient(value) !== null;
}
