import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { chatService } from "../services/ChatService";

const chatRoutes = Router();
const id = (value: unknown) => { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw Object.assign(new Error("Identificador inválido."), { statusCode: 400 }); return parsed; };
const fail = (res: Response, error: unknown) => { const typed = error as { statusCode?: number; message?: string; code?: string }; return res.status(typed.statusCode ?? 500).json({ error: typed.message ?? "Não foi possível concluir a operação.", code: typed.code }); };

chatRoutes.get("/participants", async (_req, res) => { try { res.json({ participants: await chatService.listParticipants() }); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels", async (req: AuthenticatedRequest, res) => { try { res.json({ channels: await chatService.listChannels(req.auth!.userId) }); } catch (error) { fail(res, error); } });
chatRoutes.post("/direct/:userId", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.openDirectChannel(req.auth!.userId, id(req.params.userId))); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.createChannel(req.auth!.userId, req.auth!.role, req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.json({ messages: await chatService.listMessages(req.auth!.userId, id(req.params.channelId), req.query.beforeId ? id(String(req.query.beforeId)) : undefined) }); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.sendMessage(req.auth!.userId, id(req.params.channelId), req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.delete("/messages/:messageId", async (req: AuthenticatedRequest, res) => { try { await chatService.deleteMessage(req.auth!.userId, req.auth!.role, id(req.params.messageId)); res.status(204).send(); } catch (error) { fail(res, error); } });

export { chatRoutes };
