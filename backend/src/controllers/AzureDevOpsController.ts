import type {
  Request,
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

import {
  AzureDevOpsService,
} from "../services/AzureDevOpsService";

import {
  AzureDevOpsSyncService,
} from "../services/AzureDevOpsSyncService";

export class AzureDevOpsController {
  private static readonly MAX_CONTROLLED_FULL_ITEMS =
    200;

  private static readonly MAX_INCREMENTAL_OVERLAP_MINUTES =
    60;

  private readonly azureDevOpsService:
    AzureDevOpsService;

  private readonly azureDevOpsSyncService:
    AzureDevOpsSyncService;

  constructor() {
    this.azureDevOpsService =
      new AzureDevOpsService();

    this.azureDevOpsSyncService =
      new AzureDevOpsSyncService(
        this.azureDevOpsService,
      );
  }

  /* =======================================================
     STATUS
  ======================================================= */

  public status = async (
    _req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const result =
        await this.azureDevOpsService
          .getStatus();

      return res.json(
        result,
      );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     WORK ITEM INDIVIDUAL
  ======================================================= */

  public workItem = async (
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
        await this.azureDevOpsService
          .getWorkItem(
            id,
          );

      return res.json(
        result,
      );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     DESCOBERTA WIQL
  ======================================================= */

  public discoverWorkItems = async (
    _req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const result =
        await this.azureDevOpsService
          .discoverSupportedWorkItemIds();

      return res.json({
        total:
          result.total,

        sampleIds:
          result.ids.slice(
            0,
            20,
          ),
      });
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     BATCH - DIAGNÓSTICO
  ======================================================= */

  public batchWorkItems = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      if (
        !Array.isArray(
          req.body?.ids,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Informe o campo 'ids' como uma lista.",
          });
      }

      const rawIds =
        req.body.ids as unknown[];

      const ids =
        rawIds
          .map(
            (value: unknown) =>
              this.parsePositiveInteger(
                value,
              ),
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          );

      const uniqueIds =
        [
          ...new Set<number>(
            ids,
          ),
        ];

      if (
        uniqueIds.length === 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "Nenhum ID válido foi informado.",
          });
      }

      if (
        uniqueIds.length >
        AzureDevOpsController
          .MAX_CONTROLLED_FULL_ITEMS
      ) {
        return res
          .status(400)
          .json({
            message:
              "O diagnóstico batch aceita no máximo 200 IDs por requisição.",
          });
      }

      const workItems =
        await this.azureDevOpsService
          .getWorkItemsBatch(
            uniqueIds,
          );

      return res.json({
        requested:
          uniqueIds.length,

        returned:
          workItems.length,

        items:
          workItems.map(
            (item) => ({
              id:
                item.id,

              revision:
                item.rev ??
                null,

              type:
                item.fields?.[
                  "System.WorkItemType"
                ] ??
                null,

              title:
                item.fields?.[
                  "System.Title"
                ] ??
                null,

              state:
                item.fields?.[
                  "System.State"
                ] ??
                null,

              changedDate:
                item.fields?.[
                  "System.ChangedDate"
                ] ??
                null,
            }),
          ),
      });
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     SYNC MANUAL POR IDs
  ======================================================= */

  public syncWorkItems = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      if (
        !Array.isArray(
          req.body?.ids,
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Informe o campo 'ids' como uma lista de Work Items.",
          });
      }

      const rawIds =
        req.body.ids as unknown[];

      const ids =
        rawIds
          .map(
            (value: unknown) =>
              this.parsePositiveInteger(
                value,
              ),
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          );

      const uniqueIds =
        [
          ...new Set<number>(
            ids,
          ),
        ];

      if (
        uniqueIds.length === 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "Nenhum ID de Work Item válido foi informado.",
          });
      }

      const authenticatedRequest =
        req as AuthenticatedRequest;

      const userId =
        authenticatedRequest.auth
          ?.userId ??
        null;

      const result =
        await this.azureDevOpsSyncService
          .syncWorkItems({
            ids:
              uniqueIds,

            userId,

            source:
              "MANUAL",
          });

      return res
        .status(200)
        .json(
          result,
        );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     SYNC FULL / CONTROLADO
  ======================================================= */

  public syncFull = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const authenticatedRequest =
        req as AuthenticatedRequest;

      const auth =
        authenticatedRequest.auth;

      if (
        !auth?.userId
      ) {
        return res
          .status(401)
          .json({
            message:
              "Usuário não autenticado.",
          });
      }

      if (
        auth.role !==
        "ADMIN"
      ) {
        return res
          .status(403)
          .json({
            message:
              "A sincronização completa do Azure DevOps é restrita a administradores.",
          });
      }

      const rawLimit =
        req.body?.limit;

      const full =
        req.body?.full ===
        true;

      let limit:
        number | null =
        null;

      if (
        rawLimit !==
          undefined &&
        rawLimit !==
          null
      ) {
        const parsedLimit =
          this.parsePositiveInteger(
            rawLimit,
          );

        if (
          parsedLimit === null
        ) {
          return res
            .status(400)
            .json({
              message:
                "O campo limit deve ser um número inteiro positivo.",
            });
        }

        if (
          parsedLimit >
          AzureDevOpsController
            .MAX_CONTROLLED_FULL_ITEMS
        ) {
          return res
            .status(400)
            .json({
              message:
                "Para execução controlada, o limit máximo permitido é 200.",
            });
        }

        limit =
          parsedLimit;
      }

      /*
       * Proteção contra FULL acidental.
       *
       * É obrigatório informar:
       * - limit: 1..200
       * OU
       * - full: true
       */
      if (
        limit === null &&
        !full
      ) {
        return res
          .status(400)
          .json({
            message:
              "Sincronização não iniciada. Informe um limit de até 200 itens ou full: true para executar a sincronização completa.",
          });
      }

      /*
       * Evita chamada ambígua:
       *
       * {
       *   full: true,
       *   limit: 20
       * }
       */
      if (
        full &&
        limit !== null
      ) {
        return res
          .status(400)
          .json({
            message:
              "Informe somente uma modalidade de sincronização: limit ou full.",
          });
      }

      const result =
        await this.azureDevOpsSyncService
          .syncAllSupportedWorkItems({
            userId:
              auth.userId,

            limit,
          });

      return res
        .status(200)
        .json(
          result,
        );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     SYNC INCREMENTAL

     Atualiza somente Correções/Evoluções modificadas após
     a última sincronização global bem-sucedida.

     Execução manual deste endpoint é restrita a ADMIN.
     O agendamento futuro deverá chamar o service diretamente.
  ======================================================= */

  public syncIncremental = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const authenticatedRequest =
        req as AuthenticatedRequest;

      const auth =
        authenticatedRequest.auth;

      if (
        !auth?.userId
      ) {
        return res
          .status(401)
          .json({
            message:
              "Usuário não autenticado.",
          });
      }

      if (
        auth.role !==
        "ADMIN"
      ) {
        return res
          .status(403)
          .json({
            message:
              "A sincronização incremental do Azure DevOps é restrita a administradores.",
          });
      }

      const rawOverlapMinutes =
        req.body
          ?.overlapMinutes;

      let overlapMinutes:
        number | undefined =
        undefined;

      if (
        rawOverlapMinutes !==
          undefined &&
        rawOverlapMinutes !==
          null
      ) {
        const parsedOverlapMinutes =
          this.parseNonNegativeInteger(
            rawOverlapMinutes,
          );

        if (
          parsedOverlapMinutes ===
          null
        ) {
          return res
            .status(400)
            .json({
              message:
                "O campo overlapMinutes deve ser um número inteiro entre 0 e 60.",
            });
        }

        if (
          parsedOverlapMinutes >
          AzureDevOpsController
            .MAX_INCREMENTAL_OVERLAP_MINUTES
        ) {
          return res
            .status(400)
            .json({
              message:
                "O campo overlapMinutes deve ser um número inteiro entre 0 e 60.",
            });
        }

        overlapMinutes =
          parsedOverlapMinutes;
      }

      const result =
        await this.azureDevOpsSyncService
          .syncIncrementalSupportedWorkItems({
            userId:
              auth.userId,

            overlapMinutes,
          });

      return res
        .status(200)
        .json(
          result,
        );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     WIKI
  ======================================================= */

  public wikiSearch = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limit = this.parsePositiveInteger(req.query.limit) ?? 8;
      if (query.length < 3) {
        return res.status(400).json({ message: "Informe ao menos 3 caracteres para pesquisar a Wiki." });
      }
      return res.json({
        items: await this.azureDevOpsService.searchWikiPages(query, limit),
      });
    } catch (error) {
      return this.handleError(res, error);
    }
  };

  public wikiPage = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const pageId =
        this.parsePositiveInteger(
          req.params.pageId,
        );

      if (
        pageId === null
      ) {
        return res
          .status(400)
          .json({
            message:
              "ID da página Wiki inválido.",
          });
      }

      const result =
        await this.azureDevOpsService
          .getWikiPageById(
            pageId,
          );

      return res.json(
        result,
      );
    } catch (error) {
      return this.handleError(
        res,
        error,
      );
    }
  };

  /* =======================================================
     HELPERS
  ======================================================= */

  private parsePositiveInteger(
    value: unknown,
  ): number | null {
    if (
      typeof value ===
      "number"
    ) {
      if (
        Number.isSafeInteger(
          value,
        ) &&
        value > 0
      ) {
        return value;
      }

      return null;
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

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed <= 0
    ) {
      return null;
    }

    return parsed;
  }

  private parseNonNegativeInteger(
    value: unknown,
  ): number | null {
    if (
      typeof value ===
      "number"
    ) {
      if (
        Number.isSafeInteger(
          value,
        ) &&
        value >= 0
      ) {
        return value;
      }

      return null;
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

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed < 0
    ) {
      return null;
    }

    return parsed;
  }

  private handleError(
    res: Response,
    error: unknown,
  ): Response {
    let statusCode =
      500;

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "statusCode" in
        error
    ) {
      const candidateStatusCode =
        (
          error as {
            statusCode?:
              unknown;
          }
        ).statusCode;

      if (
        typeof candidateStatusCode ===
          "number" &&
        Number.isInteger(
          candidateStatusCode,
        )
      ) {
        statusCode =
          candidateStatusCode;
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido na integração com Azure DevOps.";

    console.error(
      "[AzureDevOpsController]",
      error,
    );

    return res
      .status(
        statusCode,
      )
      .json({
        message,
      });
  }
}
