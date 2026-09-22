import { Router } from "express";
import { WorkspaceController } from "../controllers/WorkspaceController";

const workspaceRoutes = Router();
const controller = new WorkspaceController();

workspaceRoutes.get("/my-operation", controller.myOperation);
workspaceRoutes.get("/my-operation/tickets/:id", controller.ticketDetail);
workspaceRoutes.patch("/my-operation/tickets/:id/status", controller.updateTicketStatus);
workspaceRoutes.get("/technical-leadership", controller.technicalLeadership);
workspaceRoutes.get("/analyst-time-productivity", controller.analystTimeProductivity);
workspaceRoutes.get("/data-quality", controller.dataQuality);

export { workspaceRoutes };
