import type {
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

import {
  NotificationService,
} from "../services/NotificationService";

export class NotificationController {
  private readonly service = new NotificationService();

  public list = async (
    request: AuthenticatedRequest,
    response: Response,
  ) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return response.status(401).json({
        message: "Autenticação necessária.",
      });
    }

    const notifications =
      await this.service.listForUser(userId);

    return response.json({ notifications });
  };
}
