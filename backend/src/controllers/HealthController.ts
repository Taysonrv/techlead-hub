import { Request, Response } from "express";

export class HealthController {
  async index(req: Request, res: Response) {
    return res.json({
      status: process.env.APP_DATABASE_READY === "false" ? "degraded" : "online",
      database: process.env.APP_DATABASE_READY === "false" ? "unavailable" : "ready",
      project: "TechLead Hub",
      version: process.env.APP_VERSION?.trim() || "development",
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  }
}
