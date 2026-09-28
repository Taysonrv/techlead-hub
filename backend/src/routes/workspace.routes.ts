import { Router } from "express";
import { WorkspaceController } from "../controllers/WorkspaceController";
import { requirePermission } from "../middlewares/roleMiddleware";

const workspaceRoutes = Router();
const controller = new WorkspaceController();

workspaceRoutes.get("/my-operation", requirePermission("my-operation"), controller.myOperation);
workspaceRoutes.get("/my-operation/tickets/:id", requirePermission("my-operation"), controller.ticketDetail);
workspaceRoutes.patch("/my-operation/tickets/:id/status", requirePermission("my-operation"), controller.updateTicketStatus);
workspaceRoutes.get("/technical-leadership", requirePermission("technical-leadership"), controller.technicalLeadership);
workspaceRoutes.get("/analyst-time-productivity", requirePermission("performance"), controller.analystTimeProductivity);
workspaceRoutes.get("/data-quality", requirePermission("data-quality"), controller.dataQuality);

export { workspaceRoutes };
