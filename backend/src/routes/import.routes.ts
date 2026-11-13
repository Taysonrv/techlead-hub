import {
  Router,
} from "express";

import multer from "multer";
import type { NextFunction, Request, Response } from "express";

import { ImportController } from "../controllers/ImportController";
import { requirePermission } from "../middlewares/roleMiddleware";

const router =
  Router();

const controller =
  new ImportController();

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        50 *
        1024 *
        1024,
    },
  });

// Mantém o contrato legado de erro textual e evita retornar 500 quando o
// arquivo ultrapassa o limite de upload ou há erro no multipart.
const uploadSingle = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "O arquivo excede o limite permitido de 50 MB." });
        return;
      }
      res.status(400).json({ error: "Não foi possível receber o arquivo enviado." });
      return;
    }
    if (error) return next(error);
    next();
  });
};

router.post(
  "/import/tickets/preview",
  requirePermission("imports"),
  uploadSingle,
  (req, res) => controller.preview(req, res),
);

router.post(
  "/import/tickets",
  requirePermission("imports"),
  uploadSingle,
  (
    req,
    res
  ) =>
    controller.tickets(
      req,
      res
    )
);

export default router;
