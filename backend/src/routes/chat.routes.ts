import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { chatService } from "../services/ChatService";

const chatRoutes = Router();
const id = (value: unknown) => { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw Object.assign(new Error("Identificador inválido."), { statusCode: 400 }); return parsed; };
const fail = (res: Response, error: unknown) => { const typed = error as { statusCode?: number; message?: string; code?: string }; return res.status(typed.statusCode ?? 500).json({ error: typed.message ?? "Não foi possível concluir a operação.", code: typed.code }); };

chatRoutes.post("/presence", async (req: AuthenticatedRequest, res) => { try { res.json(await chatService.updatePresence(req.auth!.userId, req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels/:channelId/typing", async (req: AuthenticatedRequest, res) => { try { await chatService.setTyping(req.auth!.userId, id(req.params.channelId), Boolean(req.body?.active)); res.status(204).send(); } catch (error) { fail(res, error); } });
chatRoutes.get("/events", async (req: AuthenticatedRequest, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  let closed = false;
  req.on("close", () => { closed = true; });
  let previous = "";
  while (!closed) {
    try {
      const snapshot = await chatService.realtimeSnapshot(req.auth!.userId);
      const serialized = JSON.stringify(snapshot);
      if (serialized !== previous) {
        res.write(`event: chat\ndata: ${serialized}\n\n`);
        previous = serialized;
      } else {
        res.write(": heartbeat\n\n");
      }
    } catch {
      res.write("event: error\ndata: {}\n\n");
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  res.end();
});
chatRoutes.get("/participants", async (_req, res) => { try { res.json({ participants: await chatService.listParticipants() }); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels", async (req: AuthenticatedRequest, res) => { try { res.json({ channels: await chatService.listChannels(req.auth!.userId) }); } catch (error) { fail(res, error); } });
chatRoutes.post("/direct/:userId", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.openDirectChannel(req.auth!.userId, id(req.params.userId))); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.createChannel(req.auth!.userId, req.auth!.role, req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.json({ messages: await chatService.listMessages(req.auth!.userId, id(req.params.channelId), req.query.beforeId ? id(String(req.query.beforeId)) : undefined) }); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels/:channelId/attachments", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.sendAttachment(req.auth!.userId, id(req.params.channelId), req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.sendMessage(req.auth!.userId, id(req.params.channelId), req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.delete("/channels/:channelId", async (req: AuthenticatedRequest, res) => { try { await chatService.deleteChannel(req.auth!.userId, req.auth!.role, id(req.params.channelId)); res.status(204).send(); } catch (error) { fail(res, error); } });
chatRoutes.delete("/messages/:messageId", async (req: AuthenticatedRequest, res) => { try { await chatService.deleteMessage(req.auth!.userId, req.auth!.role, id(req.params.messageId)); res.status(204).send(); } catch (error) { fail(res, error); } });

export { chatRoutes };
