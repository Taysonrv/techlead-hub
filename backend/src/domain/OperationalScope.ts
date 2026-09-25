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

export function ticketOperationalScope():
  Prisma.TicketWhereInput {
  return {
    AND: [
      {
        client: {
          in: [
            ...SIMER_CLIENTS,
          ],
          mode:
            "insensitive",
        },
      },
      {
        owner: {
          in: [
            ...SUPPORT_ANALYSTS,
          ],
          mode:
            "insensitive",
        },
      },
    ],
  };
}

/**
 * No Azure, Cliente Principal pode representar o cliente final da
 * ocorrência, e Assigned To normalmente é um desenvolvedor.
 * O campo confiável para delimitar a origem da demanda é Created By.
 */
export function azureOperationalScope():
  Prisma.AzureWorkItemWhereInput {
  return {
    OR: [
      {
        createdByName: {
          in: [
            ...SUPPORT_ANALYSTS,
          ],
          mode:
            "insensitive",
        },
      },
      {
        client: {
          in: [
            ...SIMER_CLIENTS,
          ],
          mode:
            "insensitive",
        },
      },
      {
        movideskTicket: {
          not:
            null,
        },
      },
      {
        participantMovideskTickets: {
          not: null,
        },
      },
    ],
  };
}

/**
 * Escopo estrito da Central da Coordenação.
 * Diferente do escopo geral do Azure, aqui um Work Item só participa
 * dos indicadores quando o Cliente Principal pertence à carteira da squad.
 */
export function coordinationAzureScope(): Prisma.AzureWorkItemWhereInput {
  return {
    AND: [
      azureOperationalScope(),
      {
        client: {
          in: [...SIMER_CLIENTS],
          mode: "insensitive",
        },
      },
    ],
  };
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

export function isSimerClient(
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
    SIMER_CLIENTS.some(
      (
        client,
      ) =>
        client.toLocaleUpperCase(
          "pt-BR",
        ) ===
        normalized,
    ),
  );
}
