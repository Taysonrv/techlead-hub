import type { Request, Response } from "express";
import { CorrectionMonthlyReportService } from "../services/CorrectionMonthlyReportService";

export class CorrectionMonthlyReportController {
  private readonly service = new CorrectionMonthlyReportService();

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const month = typeof req.query.month === "string" ? req.query.month : "";
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ message: "month deve ser informado no formato YYYY-MM." });
      }
      return res.json(await this.service.get(month));
    } catch (error) {
      console.error("[correction-monthly-report] Falha ao gerar relatório:", error);
      const message = error instanceof Error ? error.message : "Não foi possível gerar o report mensal de Correções.";
      return res.status(message.includes("configurad") ? 503 : 500).json({ message });
    }
  };
}
