import axios, { AxiosError, AxiosInstance } from "axios";

import type {
  AzureDevOpsWorkItemResponse,
} from "./AzureWorkItemMapper";

/* =========================================================
   TIPOS
========================================================= */

export type AzureDevOpsStatus = {
  configured: boolean;
  organization: string | null;
  project: string | null;
  wiki: string | null;
  workItemsAvailable: boolean;
  wikiAvailable: boolean;
};

type AzureDevOpsErrorDetails = {
  status?: number;
  message: string;
  azureMessage?: string;
};

type AzureWiqlWorkItemReference = {
  id?: number;
  url?: string;
};

type AzureWiqlResponse = {
  queryType?: string;
  asOf?: string;
  workItems?: AzureWiqlWorkItemReference[];
};

type AzureWorkItemsBatchResponse = {
  count?: number;
  value?: AzureDevOpsWorkItemResponse[];
};

export type AzureWorkItemDiscoveryResult = {
  ids: number[];
  total: number;
};

/* =========================================================
   ERRO
========================================================= */

export class AzureDevOpsServiceError extends Error {
  public readonly statusCode: number;
  public readonly details: AzureDevOpsErrorDetails;

  constructor(
    message: string,
    statusCode = 500,
    details?: AzureDevOpsErrorDetails,
  ) {
    super(message);

    this.name = "AzureDevOpsServiceError";
    this.statusCode = statusCode;

    this.details =
      details ?? {
        status: statusCode,
        message,
      };
  }
}

/* =========================================================
   SERVICE
========================================================= */

export class AzureDevOpsService {
  private readonly organization: string;
  private readonly project: string;
  private readonly wiki: string;
  private readonly pat: string;
  private readonly client: AxiosInstance;

  private static readonly BATCH_SIZE = 200;

  private static readonly REQUEST_TIMEOUT_MS =
    30_000;

  constructor() {
    this.organization =
      this.getOptionalEnv(
        "AZURE_DEVOPS_ORGANIZATION",
      );

    this.project =
      this.getOptionalEnv(
        "AZURE_DEVOPS_PROJECT",
      );

    this.wiki =
      this.getOptionalEnv(
        "AZURE_DEVOPS_WIKI",
      );

    this.pat =
      this.getOptionalEnv(
        "AZURE_DEVOPS_PAT",
      );

    const baseURL =
      this.isConfigured()
        ? `https://dev.azure.com/${encodeURIComponent(
            this.organization,
          )}/${encodeURIComponent(
            this.project,
          )}`
        : "https://dev.azure.com";

    const basicToken =
      Buffer
        .from(
          `:${this.pat}`,
          "utf8",
        )
        .toString(
          "base64",
        );

    this.client =
      axios.create({
        baseURL,
        timeout:
          AzureDevOpsService.REQUEST_TIMEOUT_MS,
        headers: {
          Accept:
            "application/json",
          Authorization:
            `Basic ${basicToken}`,
        },
      });
  }

  /* =======================================================
     STATUS / CONECTIVIDADE
  ======================================================= */

  public async getStatus():
    Promise<AzureDevOpsStatus> {
    if (
      !this.isConfigured()
    ) {
      return {
        configured:
          false,
        organization:
          this.organization ||
          null,
        project:
          this.project ||
          null,
        wiki:
          this.wiki ||
          null,
        workItemsAvailable:
          false,
        wikiAvailable:
          false,
      };
    }

    let workItemsAvailable =
      false;

    let wikiAvailable =
      false;

    try {
      await this.client.get(
        "/_apis/wit/workitems/26263",
        {
          params: {
            "api-version":
              "7.1",
            fields:
              "System.Id",
          },
        },
      );

      workItemsAvailable =
        true;
    } catch {
      workItemsAvailable =
        false;
    }

    try {
      await this.client.get(
        `/_apis/wiki/wikis/${encodeURIComponent(
          this.wiki,
        )}`,
        {
          params: {
            "api-version":
              "7.1",
          },
        },
      );

      wikiAvailable =
        true;
    } catch {
      wikiAvailable =
        false;
    }

    return {
      configured:
        true,
      organization:
        this.organization,
      project:
        this.project,
      wiki:
        this.wiki,
      workItemsAvailable,
      wikiAvailable,
    };
  }

  /* =======================================================
     WORK ITEM INDIVIDUAL
  ======================================================= */

  public async getWorkItem(
    id: number,
  ): Promise<AzureDevOpsWorkItemResponse> {
    if (
      !Number.isSafeInteger(
        id,
      ) ||
      id <= 0
    ) {
      throw new AzureDevOpsServiceError(
        "O ID do Work Item é inválido.",
        400,
      );
    }

    this.ensureConfigured();

    try {
      const response =
        await this.client.get<AzureDevOpsWorkItemResponse>(
          `/_apis/wit/workitems/${id}`,
          {
            params: {
              "$expand":
                "All",
              "api-version":
                "7.1",
            },
          },
        );

      return response.data;
    } catch (error) {
      throw this.mapAxiosError(
        error,
        `Não foi possível consultar o Work Item ${id}.`,
      );
    }
  }

  /* =======================================================
     DESCOBERTA WIQL - COMPLETA
  ======================================================= */

  public async discoverSupportedWorkItemIds():
    Promise<AzureWorkItemDiscoveryResult> {
    const query = `
      SELECT
        [System.Id]
      FROM WorkItems
      WHERE
        [System.TeamProject] = @project
        AND (
          [System.WorkItemType] = 'Correção Clientes'
          OR [System.WorkItemType] = 'Evolução'
          OR [System.WorkItemType] = 'APOIO'
        )
      ORDER BY
        [System.ChangedDate] DESC
    `;

    return this.executeWorkItemDiscovery(
      query,
      "Não foi possível localizar Correções, Evoluções e APOIOs no Azure DevOps.",
      false,
    );
  }

  /* =======================================================
     DESCOBERTA WIQL - INCREMENTAL
  ======================================================= */

  public async discoverSupportedWorkItemIdsChangedSince(
    changedSince: Date,
  ): Promise<AzureWorkItemDiscoveryResult> {
    if (
      !(
        changedSince instanceof
        Date
      ) ||
      Number.isNaN(
        changedSince.getTime(),
      )
    ) {
      throw new AzureDevOpsServiceError(
        "A data de referência da sincronização incremental é inválida.",
        400,
      );
    }

    const changedSinceWiql =
      this.formatWiqlDate(
        changedSince,
      );

    const query = `
      SELECT
        [System.Id]
      FROM WorkItems
      WHERE
        [System.TeamProject] = @project
        AND (
          [System.WorkItemType] = 'Correção Clientes'
          OR [System.WorkItemType] = 'Evolução'
          OR [System.WorkItemType] = 'APOIO'
        )
        AND [System.ChangedDate] >= '${changedSinceWiql}'
      ORDER BY
        [System.ChangedDate] ASC
    `;

    return this.executeWorkItemDiscovery(
      query,
      `Não foi possível localizar Correções, Evoluções e APOIOs alterados desde ${changedSinceWiql}.`,
      true,
    );
  }

  /* =======================================================
     WORK ITEMS EM LOTE
  ======================================================= */

  public async getWorkItemsBatch(
    ids: number[],
  ): Promise<AzureDevOpsWorkItemResponse[]> {
    const normalizedIds = [
      ...new Set(
        ids.filter(
          (
            id,
          ) =>
            Number.isSafeInteger(
              id,
            ) &&
            id > 0,
        ),
      ),
    ];

    if (
      normalizedIds.length ===
      0
    ) {
      return [];
    }

    this.ensureConfigured();

    const result:
      AzureDevOpsWorkItemResponse[] =
        [];

    for (
      let index = 0;
      index <
      normalizedIds.length;
      index +=
      AzureDevOpsService.BATCH_SIZE
    ) {
      const batch =
        normalizedIds.slice(
          index,
          index +
            AzureDevOpsService.BATCH_SIZE,
        );

      try {
        const response =
          await this.client.post<AzureWorkItemsBatchResponse>(
            "/_apis/wit/workitemsbatch",
            {
              ids:
                batch,
              "$expand":
                "All",
              errorPolicy:
                "Omit",
            },
            {
              params: {
                "api-version":
                  "7.1",
              },
            },
          );

        result.push(
          ...(
            response.data
              .value ?? []
          ),
        );
      } catch (error) {
        throw this.mapAxiosError(
          error,
          `Não foi possível consultar o lote de Work Items ${batch[0]} a ${batch[batch.length - 1]}.`,
        );
      }
    }

    return result;
  }

  /* =======================================================
     WIKI
  ======================================================= */

  public async getWikiPageById(
    pageId: number,
  ): Promise<unknown> {
    if (
      !Number.isSafeInteger(
        pageId,
      ) ||
      pageId <= 0
    ) {
      throw new AzureDevOpsServiceError(
        "O ID da página Wiki é inválido.",
        400,
      );
    }

    this.ensureConfigured();

    try {
      const response =
        await this.client.get(
          `/_apis/wiki/wikis/${encodeURIComponent(
            this.wiki,
          )}/pages/${pageId}`,
          {
            params: {
              recursionLevel:
                "OneLevel",
              includeContent:
                true,
              "api-version":
                "7.1",
            },
          },
        );

      return response.data;
    } catch (error) {
      throw this.mapAxiosError(
        error,
        `Não foi possível consultar a página Wiki ${pageId}.`,
      );
    }
  }

  /* =======================================================
     WIQL
  ======================================================= */

  private async executeWorkItemDiscovery(
    query: string,
    fallbackMessage: string,
    timePrecision:
      boolean,
  ): Promise<AzureWorkItemDiscoveryResult> {
    this.ensureConfigured();

    try {
      const response =
        await this.client.post<AzureWiqlResponse>(
          "/_apis/wit/wiql",
          {
            query,
          },
          {
            params: {
              "api-version":
                "7.1",

              /*
               * IMPORTANTE:
               *
               * Consultas incrementais utilizam
               * System.ChangedDate com data + hora.
               *
               * Sem timePrecision=true o Azure interpreta
               * a consulta com precisão apenas de data e
               * rejeita timestamps como:
               *
               * 2026-09-06T03:04:59Z
               */
              timePrecision,
            },
          },
        );

      const ids =
        (
          response.data
            .workItems ?? []
        )
          .map(
            (
              item,
            ) =>
              item.id,
          )
          .filter(
            (
              id,
            ): id is number =>
              typeof id ===
                "number" &&
              Number.isSafeInteger(
                id,
              ) &&
              id > 0,
          );

      const uniqueIds = [
        ...new Set(
          ids,
        ),
      ];

      return {
        ids:
          uniqueIds,
        total:
          uniqueIds.length,
      };
    } catch (error) {
      throw this.mapAxiosError(
        error,
        fallbackMessage,
      );
    }
  }

  /* =======================================================
     FORMATAÇÃO WIQL
  ======================================================= */

  private formatWiqlDate(
    value: Date,
  ): string {
    /*
     * Mantém UTC e precisão até segundos.
     *
     * Exemplo:
     * 2026-09-06T03:04:59Z
     *
     * A precisão temporal é necessária para que o
     * incremental de 15 minutos + overlap de 5 minutos
     * não seja convertido em uma consulta diária.
     */
    return value
      .toISOString()
      .replace(
        /\.\d{3}Z$/,
        "Z",
      );
  }

  /* =======================================================
     CONFIGURAÇÃO
  ======================================================= */

  private getOptionalEnv(
    name: string,
  ): string {
    return (
      process.env[
        name
      ]?.trim() ??
      ""
    );
  }

  private isConfigured():
    boolean {
    return Boolean(
      this.organization &&
      this.project &&
      this.wiki &&
      this.pat,
    );
  }

  private ensureConfigured():
    void {
    if (
      !this.isConfigured()
    ) {
      throw new AzureDevOpsServiceError(
        "A integração com o Azure DevOps ainda não está configurada.",
        503,
        {
          status:
            503,
          message:
            "Configure AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_WIKI e AZURE_DEVOPS_PAT para utilizar a integração.",
        },
      );
    }
  }

  /* =======================================================
     ERROS
  ======================================================= */

  private mapAxiosError(
    error: unknown,
    fallbackMessage: string,
  ): AzureDevOpsServiceError {
    if (
      error instanceof
      AzureDevOpsServiceError
    ) {
      return error;
    }

    if (
      !axios.isAxiosError(
        error,
      )
    ) {
      return new AzureDevOpsServiceError(
        fallbackMessage,
        500,
        {
          status:
            500,
          message:
            fallbackMessage,
        },
      );
    }

    const axiosError =
      error as AxiosError<{
        message?: string;
      }>;

    const status =
      axiosError.response
        ?.status;

    const azureMessage =
      axiosError.response
        ?.data
        ?.message;

    if (
      axiosError.code ===
        "ECONNABORTED" ||
      axiosError.code ===
        "ETIMEDOUT"
    ) {
      return new AzureDevOpsServiceError(
        "A consulta ao Azure DevOps excedeu o tempo limite.",
        504,
        {
          status:
            504,
          message:
            fallbackMessage,
          azureMessage,
        },
      );
    }

    if (
      status ===
      400
    ) {
      return new AzureDevOpsServiceError(
        fallbackMessage,
        502,
        {
          status,
          message:
            fallbackMessage,
          azureMessage,
        },
      );
    }

    if (
      status ===
      401
    ) {
      return new AzureDevOpsServiceError(
        "O Azure DevOps recusou a autenticação.",
        502,
        {
          status,
          message:
            "Verifique se a credencial de integração continua válida.",
          azureMessage,
        },
      );
    }

    if (
      status ===
      403
    ) {
      return new AzureDevOpsServiceError(
        "A identidade da integração não possui permissão suficiente no Azure DevOps.",
        502,
        {
          status,
          message:
            "Verifique as permissões de leitura de Work Items e Wiki.",
          azureMessage,
        },
      );
    }

    if (
      status ===
      404
    ) {
      return new AzureDevOpsServiceError(
        "O recurso solicitado não foi encontrado no Azure DevOps.",
        404,
        {
          status,
          message:
            fallbackMessage,
          azureMessage,
        },
      );
    }

    if (
      status ===
      429
    ) {
      return new AzureDevOpsServiceError(
        "O Azure DevOps limitou temporariamente a quantidade de requisições.",
        503,
        {
          status,
          message:
            "A integração atingiu o limite temporário de requisições do Azure DevOps. O scheduler tentará novamente no próximo ciclo.",
          azureMessage,
        },
      );
    }

    if (
      typeof status ===
        "number" &&
      status >= 500
    ) {
      return new AzureDevOpsServiceError(
        "O Azure DevOps apresentou uma indisponibilidade temporária.",
        502,
        {
          status,
          message:
            fallbackMessage,
          azureMessage,
        },
      );
    }

    return new AzureDevOpsServiceError(
      fallbackMessage,
      502,
      {
        status,
        message:
          fallbackMessage,
        azureMessage,
      },
    );
  }
}
