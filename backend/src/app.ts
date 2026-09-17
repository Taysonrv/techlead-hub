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
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/* =========================================================
   API
========================================================= */

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
    express.static(
      frontendDistPath,
      {
        index: false,
        maxAge: "1h",
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
