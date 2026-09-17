import { Request, Response } from "express";
import { MovideskService } from "../services/MovideskService";

export class MovideskController {

    async sync(req: Request, res: Response) {

        const service = new MovideskService();

        const result = await service.syncTickets();

        return res.json(result);

    }

}