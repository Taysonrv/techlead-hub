import { Request, Response } from "express";

export class HealthController {
  async index(req: Request, res: Response) {
    return res.json({
      status: "online",
      project: "TechLead Hub",
      version: process.env.APP_VERSION?.trim() || "development",
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
    });
  }
}
