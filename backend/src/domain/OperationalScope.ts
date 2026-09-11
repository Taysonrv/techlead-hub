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

export const SUPPORT_ANALYSTS = [
  "ALAN KARDEK DA SILVA BARROS NETO",
  "DÉBORA DAL CORREIA",
  "DIEGO OLIVEIRA ARANTES",
  "LUIZ ANTÔNIO COSTA CUNHA",
  "RENAN BRENO CARVALHO",
  "TAYSON ALVES DE ARAUJO",
  "THIAGO DE LIMA MACHADO",
  "WELLINGTON ALVES GOLD",
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
