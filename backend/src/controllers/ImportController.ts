import {
  Request,
  Response,
} from "express";

import { MovideskExcelImportService } from "../services/MovideskExcelImportService";

const service =
  new MovideskExcelImportService();

export class ImportController {
  async tickets(
    req: Request,
    res: Response
  ) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            error:
              "Nenhum arquivo Excel foi enviado.",
          });
      }

      const allowedMimeTypes =
        [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ];

      const hasValidExtension =
        req.file.originalname
          .toLowerCase()
          .endsWith(
            ".xlsx"
          );

      if (
        !allowedMimeTypes.includes(
          req.file.mimetype
        ) &&
        !hasValidExtension
      ) {
        return res
          .status(400)
          .json({
            error:
              "Formato inválido. Envie um arquivo .xlsx.",
          });
      }

      const result =
        await service.execute(
          req.file.buffer
        );

      return res.json({
        message:
          "Importação concluída.",

        ...result,
      });
    } catch (error) {
      console.error(
        "Erro na importação do Excel:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            error instanceof
            Error
              ? error.message
              : "Erro ao importar o arquivo.",
        });
    }
  }
}