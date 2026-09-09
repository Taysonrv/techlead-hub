import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { WorkspaceService } from "../services/WorkspaceService";

export class WorkspaceController {
  private readonly service = new WorkspaceService();

  public myOperation = async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    return response.json(await this.service.myOperation(userId, {
      client: typeof request.query.client === "string" ? request.query.client.trim() : null,
      type: typeof request.query.type === "string" ? request.query.type.trim() : null,
      search: typeof request.query.search === "string" ? request.query.search.trim() : null,
    }));
  };

  public dataQuality = async (request: AuthenticatedRequest, response: Response) =>
    response.json(await this.service.dataQuality({
      type: typeof request.query.type === "string" ? request.query.type.trim() : null,
      client: typeof request.query.client === "string" ? request.query.client.trim() : null,
      user: typeof request.query.user === "string" ? request.query.user.trim() : null,
      issue: typeof request.query.issue === "string" ? request.query.issue.trim() : null,
      search: typeof request.query.search === "string" ? request.query.search.trim() : null,
    }));
}
