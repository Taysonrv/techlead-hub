import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";

export type SyncCenterProvider =
  | "MOVIDESK"
  | "AZURE_DEVOPS";

export type SyncCenterHistoryParams = {
  page?: number;
  pageSize?: number;
  provider?: SyncCenterProvider | null;
  status?: string | null;
  startedFrom?: Date | null;
  startedTo?: Date | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class SyncCenterService {
  public async history(
    params: SyncCenterHistoryParams,
  ) {
    const page =
      Math.max(
        DEFAULT_PAGE,
        Math.trunc(
          params.page ??
          DEFAULT_PAGE,
        ),
      );

    const pageSize =
      Math.min(
        MAX_PAGE_SIZE,
        Math.max(
          1,
          Math.trunc(
            params.pageSize ??
            DEFAULT_PAGE_SIZE,
          ),
        ),
      );

    const importWhere:
      Prisma.ImportRunWhereInput =
      this.importWhere(
        params,
      );

    const azureWhere:
      Prisma.AzureSyncRunWhereInput =
      this.azureWhere(
        params,
      );

    const includeMovidesk =
      !params.provider ||
      params.provider ===
        "MOVIDESK";

    const includeAzure =
      !params.provider ||
      params.provider ===
        "AZURE_DEVOPS";

    const candidateLimit =
      page *
      pageSize;

    const [
      importTotal,
      azureTotal,
      importRuns,
      azureRuns,
    ] =
      await prisma.$transaction([
        includeMovidesk
          ? prisma.importRun.count({
              where:
                importWhere,
            })
          : Promise.resolve(0),

        includeAzure
          ? prisma.azureSyncRun.count({
              where:
                azureWhere,
            })
          : Promise.resolve(0),

        includeMovidesk
          ? prisma.importRun.findMany({
              where:
                importWhere,
              take:
                candidateLimit,
              orderBy: [
                {
                  startedAt:
                    "desc",
                },
                {
                  id:
                    "desc",
                },
              ],
              select: {
                id: true,
                batch: true,
                source: true,
                fileName: true,
                status: true,
                totalRows: true,
                insertedRows: true,
                updatedRows: true,
                skippedRows: true,
                errorRows: true,
                message: true,
                startedAt: true,
                finishedAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            })
          : Promise.resolve([]),

        includeAzure
          ? prisma.azureSyncRun.findMany({
              where:
                azureWhere,
              take:
                candidateLimit,
              orderBy: [
                {
                  startedAt:
                    "desc",
                },
                {
                  id:
                    "desc",
                },
              ],
              select: {
                id: true,
                batch: true,
                source: true,
                status: true,
                totalItems: true,
                insertedItems: true,
                updatedItems: true,
                skippedItems: true,
                errorItems: true,
                message: true,
                startedAt: true,
                finishedAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

    const normalized = [
      ...importRuns.map(
        (run) => ({
          id:
            `MOVIDESK:${run.id}`,
          runId:
            run.id,
          provider:
            "MOVIDESK" as const,
          operation:
            run.source ??
            "MOVÍDESK_EXCEL",
          batch:
            run.batch,
          fileName:
            run.fileName,
          status:
            run.status,
          processed:
            run.totalRows,
          inserted:
            run.insertedRows,
          updated:
            run.updatedRows,
          skipped:
            run.skippedRows,
          errors:
            run.errorRows,
          message:
            run.message,
          startedAt:
            run.startedAt,
          finishedAt:
            run.finishedAt,
          durationMs:
            this.duration(
              run.startedAt,
              run.finishedAt,
            ),
          user:
            run.user,
        }),
      ),

      ...azureRuns.map(
        (run) => ({
          id:
            `AZURE_DEVOPS:${run.id}`,
          runId:
            run.id,
          provider:
            "AZURE_DEVOPS" as const,
          operation:
            run.source ??
            "AZURE_SYNC",
          batch:
            run.batch,
          fileName:
            null,
          status:
            run.status,
          processed:
            run.totalItems,
          inserted:
            run.insertedItems,
          updated:
            run.updatedItems,
          skipped:
            run.skippedItems,
          errors:
            run.errorItems,
          message:
            run.message,
          startedAt:
            run.startedAt,
          finishedAt:
            run.finishedAt,
          durationMs:
            this.duration(
              run.startedAt,
              run.finishedAt,
            ),
          user:
            run.user,
        }),
      ),
    ].sort(
      (
        left,
        right,
      ) =>
        right.startedAt.getTime() -
        left.startedAt.getTime(),
    );

    const total =
      importTotal +
      azureTotal;

    const start =
      (page - 1) *
      pageSize;

    const items =
      normalized.slice(
        start,
        start +
        pageSize,
      );

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(
            total /
            pageSize,
          );

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasPreviousPage:
        page > 1,
      hasNextPage:
        page <
        totalPages,
      items,
    };
  }

  public async summary() {
    const [
      latestMovidesk,
      latestAzure,
      movideskProcessing,
      azureProcessing,
    ] =
      await Promise.all([
        prisma.importRun.findFirst({
          orderBy: [
            {
              startedAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
        }),

        prisma.azureSyncRun.findFirst({
          orderBy: [
            {
              startedAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
        }),

        prisma.importRun.count({
          where: {
            status:
              "PROCESSING",
          },
        }),

        prisma.azureSyncRun.count({
          where: {
            status:
              "PROCESSING",
          },
        }),
      ]);

    return {
      running:
        movideskProcessing +
        azureProcessing,
      providers: {
        movidesk: {
          configured:
            true,
          latestRun:
            latestMovidesk,
        },
        azureDevOps: {
          configured:
            Boolean(
              process.env
                .AZURE_DEVOPS_ORGANIZATION &&
              process.env
                .AZURE_DEVOPS_PROJECT &&
              process.env
                .AZURE_DEVOPS_PAT
            ),
          latestRun:
            latestAzure,
        },
      },
    };
  }

  private importWhere(
    params:
      SyncCenterHistoryParams,
  ): Prisma.ImportRunWhereInput {
    return {
      ...(params.status
        ? {
            status:
              params.status as never,
          }
        : {}),

      ...(params.startedFrom ||
      params.startedTo
        ? {
            startedAt: {
              ...(params.startedFrom
                ? {
                    gte:
                      params.startedFrom,
                  }
                : {}),
              ...(params.startedTo
                ? {
                    lte:
                      params.startedTo,
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  private azureWhere(
    params:
      SyncCenterHistoryParams,
  ): Prisma.AzureSyncRunWhereInput {
    return {
      ...(params.status
        ? {
            status:
              params.status as never,
          }
        : {}),

      ...(params.startedFrom ||
      params.startedTo
        ? {
            startedAt: {
              ...(params.startedFrom
                ? {
                    gte:
                      params.startedFrom,
                  }
                : {}),
              ...(params.startedTo
                ? {
                    lte:
                      params.startedTo,
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  private duration(
    startedAt: Date,
    finishedAt:
      Date |
      null,
  ) {
    if (!finishedAt) {
      return null;
    }

    return Math.max(
      0,
      finishedAt.getTime() -
      startedAt.getTime(),
    );
  }
}
