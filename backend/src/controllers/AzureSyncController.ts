import type {
  Request,
  Response,
} from "express";

import {
  AzureDevOpsSyncService,
} from "../services/AzureDevOpsSyncService";

/* =========================================================
   CONTROLLER
========================================================= */

export class AzureSyncController {
  /* =======================================================
     STATUS / MONITORAMENTO

     Apenas consulta o estado e o histórico da sincronização.
     Nenhuma sincronização é disparada por este endpoint.
  ======================================================= */

  public status =
    async (
      _request: Request,
      response: Response,
    ): Promise<Response> => {
      try {
        const service =
          new AzureDevOpsSyncService();

        const status =
          await service.getDashboardStatus();

        return response
          .status(200)
          .json(status);
      } catch (error) {
        console.error(
          "[azure-sync] Erro ao consultar status da sincronização:",
          error,
        );

        return response
          .status(500)
          .json({
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível consultar o status da sincronização do Azure DevOps.",
          });
      }
    };
}
