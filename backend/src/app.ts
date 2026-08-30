import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

import routes from "./routes";

const app = express();

/* =========================================================
   CONFIGURAÇÕES GERAIS
========================================================= */

app.disable("x-powered-by");

app.use(
  cors({
    origin: true,
    credentials: true,
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