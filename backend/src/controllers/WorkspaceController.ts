import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { WorkspaceService } from "../services/WorkspaceService";

export class WorkspaceController {
  private readonly service = new WorkspaceService();

  public myOperation = async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    return response.json(await this.service.myOperation(userId));
  };

  public dataQuality = async (_request: AuthenticatedRequest, response: Response) =>
    response.json(await this.service.dataQuality());
}
