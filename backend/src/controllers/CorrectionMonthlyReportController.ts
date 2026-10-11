import type { Request, Response } from "express";
import { CorrectionMonthlyReportService } from "../services/CorrectionMonthlyReportService";

export class CorrectionMonthlyReportController {
  constructor(
    private readonly service:Pick<CorrectionMonthlyReportService,"getPreview">=new CorrectionMonthlyReportService(),
    private readonly responseWaitMs=4000,
  ) {}

  public get = async (req: Request, res: Response): Promise<Response> => {
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const month = typeof req.query.month === "string" ? req.query.month : "";
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ message: "month deve ser informado no formato YYYY-MM." });
      }
      const forceRefresh = req.query.refresh === "1";
      const data=await Promise.race([
        this.service.getPreview(month,forceRefresh),
        new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),this.responseWaitMs);}),
      ]);
      // A primeira prévia pode aguardar o PostgreSQL. A consulta continua
      // compartilhada no serviço, enquanto a tela recebe um estado sem totais.
      if(data===null) return res.status(202).json({status:"generating",month,retryAfterMs:3000});
      return res.json(data);
    } catch (error) {
      console.error("[correction-monthly-report] Falha ao gerar relatório:", error);
      const message = error instanceof Error ? error.message : "Não foi possível gerar o report mensal de Correções.";
      return res.status(message.includes("configurad") ? 503 : 500).json({ message });
    } finally {
      if(timer)clearTimeout(timer);
    }
  };
}
