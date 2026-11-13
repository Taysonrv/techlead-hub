import {
  Request,
  Response,
} from "express";

import { MovideskExcelImportService } from "../services/MovideskExcelImportService";
import { MovideskJsonImportService } from "../services/MovideskJsonImportService";
import { ImportPreviewService } from "../services/ImportPreviewService";
import { validateImportFile } from "../utils/importFileValidation";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

const excelService =
  new MovideskExcelImportService();

const jsonService =
  new MovideskJsonImportService();

const previewService =
  new ImportPreviewService();

export class ImportController {
  async preview(
    req: Request,
    res: Response,
  ) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo do Movidesk foi enviado." });
      }

      validateImportFile(req.file);
      return res.json(await previewService.inspect(req.file));
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Não foi possível validar o arquivo.",
      });
    }
  }

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
              "Nenhum arquivo do Movidesk foi enviado.",
          });
      }

      let format: "json" | "xlsx";
      try {
        format = validateImportFile(req.file);
      } catch (validationError) {
        return res.status(400).json({ error: validationError instanceof Error ? validationError.message : "Arquivo inválido." });
      }

      const authenticatedRequest =
        req as AuthenticatedRequest;

      const importer =
        format === "json"
          ? jsonService
          : excelService;

      const result =
        await importer.execute(
          req.file.buffer,
          {
            fileName:
              req.file.originalname,
            fileHash:
              req.body.fileHash || undefined,
            userId:
              authenticatedRequest.auth
                ?.userId ??
              null,
          },
        );

      return res.json({
        message:
          "Importação concluída.",

        ...result,
      });
    } catch (error) {
      console.error(
        "Erro na importação do Movidesk:",
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
