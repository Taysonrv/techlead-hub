import type {
  Request,
  Response,
} from "express";

import {
  AzureWorkItemService,
  type AzureWorkItemSortField,
  type SortDirection,
} from "../services/AzureWorkItemService";

/* =========================================================
   CONSTANTES
========================================================= */

const MAX_PAGE_SIZE =
  100;

const DEFAULT_PAGE =
  1;

const DEFAULT_PAGE_SIZE =
  25;

const SUPPORTED_WORK_ITEM_TYPES =
  new Set([
    "Correção Clientes",
    "Evolução",
    "APOIO",
  ]);

/* =========================================================
   CONTROLLER
========================================================= */

export class AzureWorkItemController {
  private readonly service:
    AzureWorkItemService;

  constructor() {
    this.service =
      new AzureWorkItemService();
  }

  /* =======================================================
     LISTAGEM
  ======================================================= */

  public list = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      /* ===================================================
         PAGINAÇÃO
      =================================================== */

      const page =
        this.parsePositiveInteger(
          req.query.page,
        ) ??
        DEFAULT_PAGE;

      const pageSize =
        this.parsePositiveInteger(
          req.query.pageSize,
        ) ??
        DEFAULT_PAGE_SIZE;

      if (
        pageSize >
        MAX_PAGE_SIZE
      ) {
        return res
          .status(400)
          .json({
            message:
              `pageSize deve ser menor ou igual a ${MAX_PAGE_SIZE}.`,
          });
      }

      /* ===================================================
         TIPO
      =================================================== */

      const type =
        this.parseString(
          req.query.type,
        );

      if (
        type &&
        !SUPPORTED_WORK_ITEM_TYPES.has(
          type,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "type deve ser Correção Clientes, Evolução ou APOIO.",
          });
      }

      /* ===================================================
         BOOLEANOS
      =================================================== */

      const prioritized =
        this.parseOptionalBoolean(
          req.query.prioritized,
        );

      if (
        prioritized.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "prioritized deve ser true ou false.",
          });
      }

      const blockedProcess =
        this.parseOptionalBoolean(
          req.query.blockedProcess,
        );

      if (
        blockedProcess.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "blockedProcess deve ser true ou false.",
          });
      }

      const hasMovideskTicket =
        this.parseOptionalBoolean(
          req.query.hasMovideskTicket,
        );

      if (
        hasMovideskTicket.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "hasMovideskTicket deve ser true ou false.",
          });
      }

      const hasAssignedTo =
        this.parseOptionalBoolean(
          req.query.hasAssignedTo,
        );

      if (
        hasAssignedTo.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "hasAssignedTo deve ser true ou false.",
          });
      }

      const hasDeliveredVersion =
        this.parseOptionalBoolean(
          req.query.hasDeliveredVersion,
        );

      if (
        hasDeliveredVersion.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "hasDeliveredVersion deve ser true ou false.",
          });
      }

      /* ===================================================
         MOVIDESK
      =================================================== */

      const movideskTicket =
        req.query.movideskTicket ===
        undefined
          ? null
          : this.parsePositiveInteger(
              req.query.movideskTicket,
            );

      if (
        req.query.movideskTicket !==
          undefined &&
        movideskTicket ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "movideskTicket deve ser um número inteiro positivo.",
          });
      }

      /* ===================================================
         PERÍODO
      =================================================== */

      const changedFrom =
        this.parseDateBoundary(
          req.query.changedFrom,
          "start",
        );

      if (
        req.query.changedFrom !==
          undefined &&
        changedFrom ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "changedFrom deve ser uma data válida.",
          });
      }

      const changedTo =
        this.parseDateBoundary(
          req.query.changedTo,
          "end",
        );

      if (
        req.query.changedTo !==
          undefined &&
        changedTo ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "changedTo deve ser uma data válida.",
          });
      }

      if (
        changedFrom &&
        changedTo &&
        changedFrom.getTime() >
          changedTo.getTime()
      ) {
        return res
          .status(400)
          .json({
            message:
              "changedFrom não pode ser posterior a changedTo.",
          });
      }

      /* ===================================================
         ORDENAÇÃO
      =================================================== */

      const sortBy =
        this.parseSortField(
          req.query.sortBy,
        );

      if (
        req.query.sortBy !==
          undefined &&
        sortBy ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "Campo de ordenação inválido.",
          });
      }

      const sortDirection =
        this.parseSortDirection(
          req.query.sortDirection,
        );

      if (
        req.query.sortDirection !==
          undefined &&
        sortDirection ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "sortDirection deve ser asc ou desc.",
          });
      }

      /* ===================================================
         CONSULTA
      =================================================== */

      const result =
        await this.service.list({
          page,
          pageSize,

          type,

          state:
            this.parseString(
              req.query.state,
            ),

          assignedTo:
            this.parseString(
              req.query.assignedTo,
            ),

          client:
            this.parseString(
              req.query.client,
            ),

          criticality:
            this.parseString(
              req.query.criticality,
            ),

          module:
            this.parseString(
              req.query.module,
            ),

          process:
            this.parseString(
              req.query.process,
            ),

          deliveredVersion:
            this.parseString(
              req.query.deliveredVersion,
            ),

          search:
            this.parseString(
              req.query.search,
            ),

          prioritized:
            prioritized.value,

          blockedProcess:
            blockedProcess.value,

          hasMovideskTicket:
            hasMovideskTicket.value,

          hasAssignedTo:
            hasAssignedTo.value,

          hasDeliveredVersion:
            hasDeliveredVersion.value,

          movideskTicket,

          changedFrom,
          changedTo,

          sortBy:
            sortBy ??
            undefined,

          sortDirection:
            sortDirection ??
            undefined,
        });

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     RESUMO GERENCIAL
  ======================================================= */

  public summary = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const type =
        this.parseString(
          req.query.type,
        );

      if (
        type &&
        !SUPPORTED_WORK_ITEM_TYPES.has(
          type,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "type deve ser Correção Clientes, Evolução ou APOIO.",
          });
      }

      const result =
        await this.service.summary(
          type,
        );

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     VISÃO DE VERSÕES
  ======================================================= */

  public versionsSummary = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const type =
        this.parseString(
          req.query.type,
        );

      if (
        type &&
        !SUPPORTED_WORK_ITEM_TYPES.has(
          type,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "type deve ser Correção Clientes, Evolução ou APOIO.",
          });
      }

      const prioritized =
        this.parseOptionalBoolean(
          req.query.prioritized,
        );

      if (
        prioritized.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "prioritized deve ser true ou false.",
          });
      }

      const blockedProcess =
        this.parseOptionalBoolean(
          req.query.blockedProcess,
        );

      if (
        blockedProcess.invalid
      ) {
        return res
          .status(400)
          .json({
            message:
              "blockedProcess deve ser true ou false.",
          });
      }

      const result =
        await this.service.versionsSummary({
          type,

          state:
            this.parseString(
              req.query.state,
            ),

          client:
            this.parseString(
              req.query.client,
            ),

          criticality:
            this.parseString(
              req.query.criticality,
            ),

          assignedTo:
            this.parseString(
              req.query.assignedTo,
            ),

          search:
            this.parseString(
              req.query.search,
            ),

          prioritized:
            prioritized.value,

          blockedProcess:
            blockedProcess.value,
        });

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     PRODUTIVIDADE DOS ANALISTAS
  ======================================================= */

  public analystProductivity = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const createdFrom =
        this.parseDateBoundary(
          req.query.createdFrom,
          "start",
        );

      if (
        req.query.createdFrom !==
          undefined &&
        createdFrom ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "createdFrom deve ser uma data válida.",
          });
      }

      const createdTo =
        this.parseDateBoundary(
          req.query.createdTo,
          "end",
        );

      if (
        req.query.createdTo !==
          undefined &&
        createdTo ===
          null
      ) {
        return res
          .status(400)
          .json({
            message:
              "createdTo deve ser uma data válida.",
          });
      }

      if (
        createdFrom &&
        createdTo &&
        createdFrom.getTime() >
          createdTo.getTime()
      ) {
        return res
          .status(400)
          .json({
            message:
              "createdFrom não pode ser posterior a createdTo.",
          });
      }

      const result =
        await this.service
          .analystProductivity({
            createdFrom,
            createdTo,
            creator:
              this.parseString(
                req.query.creator,
              ),
          });

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     FILTROS
  ======================================================= */

  public filters = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const type =
        this.parseString(
          req.query.type,
        );

      if (
        type &&
        !SUPPORTED_WORK_ITEM_TYPES.has(
          type,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "type deve ser Correção Clientes, Evolução ou APOIO.",
          });
      }

      const result =
        await this.service.filters(
          type,
        );

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     DETALHE
  ======================================================= */

  public detail = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const id =
        this.parsePositiveInteger(
          req.params.id,
        );

      if (
        id === null
      ) {
        return res
          .status(400)
          .json({
            message:
              "ID do Work Item inválido.",
          });
      }

      const result =
        await this.service.getById(
          id,
        );

      if (!result) {
        return res
          .status(404)
          .json({
            message:
              "Work Item não encontrado.",
          });
      }

      return res
        .status(200)
        .json(result);
    } catch (
      error
    ) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     STRINGS
  ======================================================= */

  private parseString(
    value: unknown,
  ): string | null {
    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    return normalized ||
      null;
  }

  /* =======================================================
     INTEIROS POSITIVOS
  ======================================================= */

  private parsePositiveInteger(
    value: unknown,
  ): number | null {
    if (
      typeof value ===
      "number"
    ) {
      return (
        Number.isSafeInteger(
          value,
        ) &&
        value > 0
      )
        ? value
        : null;
    }

    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    if (
      !/^\d+$/.test(
        normalized,
      )
    ) {
      return null;
    }

    const parsed =
      Number(
        normalized,
      );

    return (
      Number.isSafeInteger(
        parsed,
      ) &&
      parsed > 0
    )
      ? parsed
      : null;
  }

  /* =======================================================
     BOOLEANOS OPCIONAIS

     Precisamos distinguir:
     - parâmetro ausente
     - false válido
     - valor inválido
  ======================================================= */

  private parseOptionalBoolean(
    value: unknown,
  ): {
    value:
      boolean | null;

    invalid:
      boolean;
  } {
    if (
      value ===
      undefined
    ) {
      return {
        value:
          null,

        invalid:
          false,
      };
    }

    if (
      value === true ||
      value === "true"
    ) {
      return {
        value:
          true,

        invalid:
          false,
      };
    }

    if (
      value === false ||
      value === "false"
    ) {
      return {
        value:
          false,

        invalid:
          false,
      };
    }

    return {
      value:
        null,

      invalid:
        true,
    };
  }

  /* =======================================================
     DATAS

     Quando o frontend enviar somente YYYY-MM-DD:
     - changedFrom -> início do dia UTC
     - changedTo   -> final do dia UTC

     Quando enviar data/hora completa, preservamos o valor
     informado e deixamos o Date fazer o parsing ISO.
  ======================================================= */

  private parseDateBoundary(
    value: unknown,
    boundary:
      "start" |
      "end",
  ): Date | null {
    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    if (!normalized) {
      return null;
    }

    const dateOnlyPattern =
      /^\d{4}-\d{2}-\d{2}$/;

    if (
      dateOnlyPattern.test(
        normalized,
      )
    ) {
      const suffix =
        boundary ===
        "start"
          ? "T00:00:00.000Z"
          : "T23:59:59.999Z";

      const parsed =
        new Date(
          `${normalized}${suffix}`,
        );

      return Number.isNaN(
        parsed.getTime(),
      )
        ? null
        : parsed;
    }

    const parsed =
      new Date(
        normalized,
      );

    return Number.isNaN(
      parsed.getTime(),
    )
      ? null
      : parsed;
  }

  /* =======================================================
     ORDENAÇÃO
  ======================================================= */

  private parseSortField(
    value: unknown,
  ):
    AzureWorkItemSortField |
    null {
    if (
      value === undefined
    ) {
      return null;
    }

    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const fields:
      AzureWorkItemSortField[] = [
        "id",
        "title",
        "state",
        "workItemType",
        "assignedToName",
        "client",
        "criticality",
        "deliveredVersion",
        "azureCreatedAt",
        "azureChangedAt",
        "azureClosedAt",
        "stateChangedAt",
        "syncedAt",
      ];

    return fields.includes(
      value as
        AzureWorkItemSortField,
    )
      ? (
          value as
            AzureWorkItemSortField
        )
      : null;
  }

  private parseSortDirection(
    value: unknown,
  ):
    SortDirection |
    null {
    if (
      value === undefined
    ) {
      return null;
    }

    if (
      value === "asc" ||
      value === "desc"
    ) {
      return value;
    }

    return null;
  }

  /* =======================================================
     ERROS
  ======================================================= */

  private handleError(
    res: Response,
    error: unknown,
  ): Response {
    console.error(
      "[AzureWorkItemController]",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao consultar os Work Items.";

    return res
      .status(500)
      .json({
        message,
      });
  }
}