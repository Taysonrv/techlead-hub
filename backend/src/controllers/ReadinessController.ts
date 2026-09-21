import type {
  Request,
  Response,
} from "express";

import {
  prisma,
} from "../database/prisma";

/* =========================================================
   READINESS
========================================================= */

export class ReadinessController {
  async index(
    _request:
      Request,

    response:
      Response
  ) {
    try {
      /*
       * Consulta mínima e sem dados de negócio.
       *
       * O endpoint é público porque é utilizado pelo processo
       * principal do Electron antes de existir uma sessão
       * autenticada. Ele informa somente se aplicação + banco
       * estão prontos.
       */
      const startedAt = Date.now();
      await prisma.$queryRaw`
        SELECT 1
      `;
      const databaseLatencyMs = Date.now() - startedAt;

      const latestSync = await prisma.azureSyncRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { status: true, startedAt: true, finishedAt: true, source: true },
      });

      return response
        .status(200)
        .json({
          status:
            "ready",
          version: process.env.APP_VERSION?.trim() || "development",
          runtime: process.env.APP_RUNTIME?.trim() || "desktop",
          database: "ready",
          databaseLatencyMs,
          azureSync: latestSync ? {
            status: latestSync.status,
            source: latestSync.source,
            startedAt: latestSync.startedAt,
            finishedAt: latestSync.finishedAt,
            ageMinutes: Math.max(0, Math.round((Date.now() - latestSync.startedAt.getTime()) / 60_000)),
          } : null,
          checkedAt: new Date().toISOString(),
        });
    } catch {
      return response
        .status(503)
        .json({
          status:
            "unavailable",
        });
    }
  }
}
