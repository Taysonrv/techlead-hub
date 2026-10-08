import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";

import routes from "./routes";

const app = express();

/* =========================================================
   CONFIGURAÇÕES GERAIS
========================================================= */

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY?.trim() || "loopback");

app.use((req, res, next) => {
  const requestId = typeof req.headers["x-request-id"] === "string" && /^[A-Za-z0-9._-]{8,100}$/.test(req.headers["x-request-id"])
    ? req.headers["x-request-id"]
    : crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      try {
        const url = new URL(origin);
        const localHost =
          url.hostname === "127.0.0.1" ||
          url.hostname === "localhost";

        callback(null, localHost || allowedOrigins.has(url.origin));
      } catch {
        callback(null, false);
      }
    },
    credentials: false,
  })
);

app.use(
  express.json({
    // Publicações Web do Bizagi podem ultrapassar 100 MB em ZIP (base64 aumenta ~33%).
    limit: "200mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "200mb",
  })
);

const requestWindows = new Map<string, { startedAt: number; count: number }>();

function requestRateLimitIdentity(req: express.Request) {
  const authorization = req.get("authorization")?.trim();
  if (authorization?.toLocaleLowerCase("en-US").startsWith("bearer ") && authorization.length > 20) {
    const token = authorization.slice(7).trim();
    try {
      const payloadPart = token.split(".")[1];
      const payload = payloadPart
        ? JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { sid?: unknown }
        : null;
      if (typeof payload?.sid === "string" && payload.sid) {
        const fingerprint = crypto.createHash("sha256").update(payload.sid).digest("hex").slice(0, 24);
        return `session:${fingerprint}`;
      }
    } catch {
      // Token inválido será rejeitado pelo authMiddleware; aqui usamos apenas
      // uma identidade estável para o bucket de volume.
    }
    const fingerprint = crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
    return `token:${fingerprint}`;
  }
  return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

function isBackgroundApiRequest(req: express.Request) {
  const key = `${req.method.toUpperCase()} ${req.path}`;
  return new Set([
    "POST /auth/heartbeat",
    "GET /notifications",
    "GET /notifications/meetings",
    "GET /chat/channels",
    "GET /chat/events",
    "POST /chat/presence",
  ]).has(key);
}

app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login") return next();

  const windowMs = Math.max(Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000), 10_000);
  const configuredMax = Math.max(Number(process.env.API_RATE_LIMIT_MAX ?? 600), 60);
  const background = isBackgroundApiRequest(req);
  const maxRequests = background ? Math.max(configuredMax, 240) : configuredMax;
  const now = Date.now();
  const key = `${requestRateLimitIdentity(req)}:${background ? "background" : "foreground"}`;
  const current = requestWindows.get(key);

  if (!current || current.startedAt <= now - windowMs) {
    requestWindows.set(key, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Muitas requisições. Aguarde alguns instantes e tente novamente.",
        retryAfterSeconds: retryAfter,
      });
    }
  }

  if (requestWindows.size > 5_000) {
    for (const [entryKey, value] of requestWindows) {
      if (value.startedAt <= now - windowMs) requestWindows.delete(entryKey);
    }
  }
  next();
});

/* =========================================================
   API
========================================================= */

app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "alive", version: process.env.APP_VERSION?.trim() || "development", runtime: process.env.APP_RUNTIME?.trim() || "desktop", timestamp: new Date().toISOString() });
});

app.get("/health", (_req, res) => {
  const databaseReady = process.env.APP_DATABASE_READY !== "false";

  /*
   * /health é exclusivamente liveness: se o Express respondeu,
   * o processo está vivo. A disponibilidade do PostgreSQL pertence
   * ao /health/ready. Manter 200 aqui evita que o Desktop interprete
   * banco degradado como falha da porta 3333 e tente subir um segundo
   * backend sobre a mesma porta.
   */
  res.status(200).json({
    status: databaseReady ? "ok" : "degraded",
    database: databaseReady ? "ready" : "unavailable",
    scheduler: databaseReady ? "enabled" : "disabled",
    timestamp: new Date().toISOString(),
  });
});

app.use(routes);

/* =========================================================
   FRONTEND DE PRODUÇÃO
========================================================= */

/**
 * Estrutura esperada:
 *
 * techlead-hub/
 * ├── backend/
 * │   ├── src/
 * │   └── dist/
 * │
 * └── frontend/
 *     └── dist/
 */

const frontendDistPath =
  path.resolve(
    __dirname,
    "../../frontend/dist"
  );

const frontendIndexPath =
  path.join(
    frontendDistPath,
    "index.html"
  );

const frontendAvailable =
  fs.existsSync(
    frontendIndexPath
  );

if (frontendAvailable) {
  console.log(
    `[frontend] Servindo aplicação em: ${frontendDistPath}`
  );

  /*
   * Assets gerados pelo Vite:
   *
   * /assets/index-xxxxx.js
   * /assets/index-xxxxx.css
   */

  app.use(
    "/assets",
    express.static(
      path.join(frontendDistPath, "assets"),
      { maxAge: "1y", immutable: true, index: false }
    )
  );

  app.use(
    express.static(
      frontendDistPath,
      {
        index: false,
        /*
         * index.html nunca é servido pelo express.static (index:false), mas os
         * chunks também não devem ficar presos em cache durante uma atualização
         * local/desktop. Os nomes possuem hash, portanto immutable é seguro.
         */
        maxAge: "1y",
        immutable: true,
      }
    )
  );

  /*
   * SPA FALLBACK
   *
   * BrowserRouter possui rotas como:
   *
   * /
   * /tickets
   * /analistas
   * /clientes
   * /atencao
   * /importar
   *
   * Quando o usuário acessar diretamente uma delas,
   * entregamos index.html e o React Router assume
   * a navegação.
   *
   * Não fazemos fallback para /api ou /health.
   */

  app.get(
    /^\/(?!api(?:\/|$)|health(?:\/|$)).*/,
    (_req, res) => {
      /*
       * O shell da SPA precisa ser sempre revalidado. Sem isso, uma atualização
       * pode manter um index.html antigo apontando para chunks removidos ou para
       * um grafo de bundles de uma versão anterior.
       */
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(
        frontendIndexPath
      );
    }
  );
} else {
  console.warn(
    `[frontend] Build não encontrado em: ${frontendDistPath}`
  );

  console.warn(
    "[frontend] Execute `npm run build` dentro da pasta frontend."
  );
}

/* =========================================================
   404 DA API
========================================================= */

app.use(
  "/api",
  (_req, res) => {
    return res
      .status(404)
      .json({
        error:
          "Endpoint não encontrado.",
      });
  }
);

/* =========================================================
   TRATAMENTO GLOBAL DE ERROS
========================================================= */

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      "[server] Erro não tratado:",
      error
    );

    if (
      res.headersSent
    ) {
      return;
    }

    return res
      .status(500)
      .json({
        error:
          "Ocorreu um erro interno no servidor.",
      });
  }
);

export default app;
