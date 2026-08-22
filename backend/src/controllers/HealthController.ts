import { Request, Response } from "express";

export class HealthController {
  async index(req: Request, res: Response) {
    return res.json({
      status: "online",
      project: "TechLead Hub",
      database: "connected",
      version: "1.0.0"
    });
  }
}