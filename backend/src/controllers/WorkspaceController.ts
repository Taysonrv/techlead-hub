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

  public ticketDetail = async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.auth?.userId;
    const ticketId = Number(request.params.id);
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return response.status(400).json({ message: "Atendimento inválido." });
    }
    try {
      return response.json(await this.service.ticketDetail(userId, ticketId));
    } catch (error) {
      return response.status(404).json({ message: error instanceof Error ? error.message : "Atendimento não encontrado." });
    }
  };

  public updateTicketStatus = async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.auth?.userId;
    const ticketId = Number(request.params.id);
    const status = typeof request.body?.status === "string" ? request.body.status.trim() : "";
    const justification = typeof request.body?.justification === "string"
      ? request.body.justification.trim()
      : null;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0 || !status) {
      return response.status(400).json({ message: "Atendimento e status são obrigatórios." });
    }
    try {
      return response.json(await this.service.updateTicketStatus(userId, ticketId, status, justification));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o atendimento.";
      return response.status(message.includes("configurada") ? 503 : 400).json({ message });
    }
  };
}
