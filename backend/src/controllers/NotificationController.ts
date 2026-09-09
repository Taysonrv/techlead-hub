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

    const result =
      await this.service.listForUser(userId);

    return response.json(result);
  };

  public markRead = async (
    request: AuthenticatedRequest,
    response: Response,
  ) => {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    const keys = Array.isArray(request.body?.keys) ? request.body.keys : [];
    const total = await this.service.markRead(
      userId,
      keys.filter((key: unknown): key is string => typeof key === "string"),
    );
    return response.json({ total });
  };

  public savePreferences = async (
    request: AuthenticatedRequest,
    response: Response,
  ) => {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    const boolean = (value: unknown, fallback = true) =>
      typeof value === "boolean" ? value : fallback;
    const preferences = await this.service.savePreferences(userId, {
      appVersion: boolean(request.body?.appVersion),
      simerVersion: boolean(request.body?.simerVersion),
      azureCompleted: boolean(request.body?.azureCompleted),
      azureUpdated: boolean(request.body?.azureUpdated),
      desktopAlerts: boolean(request.body?.desktopAlerts),
    });
    return response.json({ preferences });
  };
}
