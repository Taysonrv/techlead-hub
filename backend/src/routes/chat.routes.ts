import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { chatService } from "../services/ChatService";
import { chatEventBus } from "../services/ChatEventBus";

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
  let running = false;
  let previous = "";
  let timer: ReturnType<typeof setInterval> | null = null;
  let fallback: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let sequence = 0;
  let cursor = typeof req.headers["last-event-id"] === "string" && /^\\d{1,20}$/.test(req.headers["last-event-id"]) ? req.headers["last-event-id"] : "0";
  const stop = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (fallback) clearInterval(fallback);
    unsubscribe?.();
  };
  req.on("close", stop);
  res.on("close", stop);

  // Mantém o SSE barato: heartbeat frequente não consulta o banco.
  // O snapshot consulta o banco em cadência própria e nunca sobrepõe execuções.
  const refresh = async () => {
    if (closed || running) return;
    running = true;
    try {
      const [snapshot, changes] = await Promise.all([
        chatService.realtimeSnapshot(req.auth!.userId),
        chatService.deliveryChangesSince(req.auth!.userId, cursor),
      ]);
      const serialized = JSON.stringify(snapshot);
      if (!closed && (serialized !== previous || changes.changed)) {
        res.write(`id: ${changes.cursor}\nevent: chat\ndata: ${serialized}\n\n`);
        previous = serialized;
        cursor = changes.cursor;
      }
    } catch {
      if (!closed) res.write(": realtime temporarily unavailable\n\n");
    } finally {
      running = false;
    }
  };

  res.write(": connected\n\n");
  void refresh();
  timer = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, 20_000);

  // Publicação imediata por evento; snapshot periódico apenas como rede de segurança.
  unsubscribe = chatEventBus.subscribe(req.auth!.userId, () => { void refresh(); });
  fallback = setInterval(() => { void refresh(); }, 5_000);
  // O ciclo de vida da resposta fica a cargo dos eventos 'close'.

});
chatRoutes.get("/events/changes", async (req: AuthenticatedRequest, res) => {
  try {
    const cursor = typeof req.query.after === "string" ? req.query.after : "0";
    res.json(await chatService.deliveryChangesSince(req.auth!.userId, cursor));
  } catch (error) { fail(res, error); }
});
chatRoutes.get("/participants", async (_req, res) => { try { res.json({ participants: await chatService.listParticipants() }); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels", async (req: AuthenticatedRequest, res) => { try { res.json({ channels: await chatService.listChannels(req.auth!.userId) }); } catch (error) { fail(res, error); } });
chatRoutes.post("/direct/:userId", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.openDirectChannel(req.auth!.userId, id(req.params.userId))); } catch (error) { fail(res, error); } });
chatRoutes.post("/context", async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json(await chatService.openContextChannel(req.auth!.userId, req.body ?? {})); }
  catch (error) { fail(res, error); }
});
chatRoutes.get("/channels/:channelId/context", async (req: AuthenticatedRequest, res) => {
  try { res.json(await chatService.incidentContext(req.auth!.userId, id(req.params.channelId))); }
  catch (error) { fail(res, error); }
});
chatRoutes.get("/channels/:channelId/actions", async (req: AuthenticatedRequest, res) => {
  try { res.json({ actions: await chatService.listIncidentActions(req.auth!.userId, id(req.params.channelId)) }); }
  catch (error) { fail(res, error); }
});
chatRoutes.post("/channels/:channelId/actions", async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json(await chatService.createIncidentAction(req.auth!.userId, id(req.params.channelId), req.body ?? {})); }
  catch (error) { fail(res, error); }
});
chatRoutes.patch("/channels/:channelId/actions/:actionId", async (req: AuthenticatedRequest, res) => {
  try { res.json(await chatService.updateIncidentAction(req.auth!.userId, id(req.params.channelId), id(req.params.actionId), req.body ?? {})); }
  catch (error) { fail(res, error); }
});
chatRoutes.post("/channels/:channelId/read", async (req: AuthenticatedRequest, res) => {
  try { res.json(await chatService.markRead(req.auth!.userId, id(req.params.channelId))); }
  catch (error) { fail(res, error); }
});
chatRoutes.post("/channels", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.createChannel(req.auth!.userId, req.auth!.role, req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels/:channelId/search", async (req: AuthenticatedRequest, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ messages: await chatService.searchMessages(req.auth!.userId, id(req.params.channelId), query) });
  } catch (error) { fail(res, error); }
});
chatRoutes.get("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.json({ messages: await chatService.listMessages(req.auth!.userId, id(req.params.channelId), req.query.beforeId ? id(String(req.query.beforeId)) : undefined) }); } catch (error) { fail(res, error); } });
chatRoutes.get("/channels/:channelId/attachments/:messageId", async (req: AuthenticatedRequest, res) => {
  try {
    const attachment = await chatService.downloadAttachment(req.auth!.userId, id(req.params.channelId), id(req.params.messageId));
    const safeName = attachment.name.replace(/[\r\n"\\]/g, "_");
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    res.send(Buffer.from(attachment.data));
  } catch (error) { fail(res, error); }
});
chatRoutes.post("/channels/:channelId/attachments", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.sendAttachment(req.auth!.userId, id(req.params.channelId), req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.post("/channels/:channelId/messages", async (req: AuthenticatedRequest, res) => { try { res.status(201).json(await chatService.sendMessage(req.auth!.userId, id(req.params.channelId), req.body ?? {})); } catch (error) { fail(res, error); } });
chatRoutes.delete("/channels/:channelId", async (req: AuthenticatedRequest, res) => { try { await chatService.deleteChannel(req.auth!.userId, req.auth!.role, id(req.params.channelId)); res.status(204).send(); } catch (error) { fail(res, error); } });
chatRoutes.post("/maintenance/direct-duplicates", async (req: AuthenticatedRequest, res) => { try { res.json(await chatService.consolidateDirectDuplicates(req.auth!.userId, req.auth!.role)); } catch (error) { fail(res, error); } });
chatRoutes.delete("/messages/:messageId", async (req: AuthenticatedRequest, res) => { try { await chatService.deleteMessage(req.auth!.userId, req.auth!.role, id(req.params.messageId)); res.status(204).send(); } catch (error) { fail(res, error); } });

export { chatRoutes };
