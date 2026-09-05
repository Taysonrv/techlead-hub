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
      await prisma.$queryRaw`
        SELECT 1
      `;

      return response
        .status(200)
        .json({
          status:
            "ready",
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
