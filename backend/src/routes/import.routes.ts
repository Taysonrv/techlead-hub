import {
  Router,
} from "express";

import multer from "multer";

import { ImportController } from "../controllers/ImportController";
import { requireRoles } from "../middlewares/roleMiddleware";

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
        25 *
        1024 *
        1024,
    },
  });

router.post(
  "/import/tickets",
  requireRoles("ADMIN", "COORDENADOR"),
  upload.single(
    "file"
  ),
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
