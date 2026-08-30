import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  shell,
} from "electron";

import {
  spawn,
} from "node:child_process";

import type {
  ChildProcess,
} from "node:child_process";

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

import {
  autoUpdater,
} from "electron-updater";

import type {
  AppUpdater,
  ProgressInfo,
  UpdateInfo,
} from "electron-updater";

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const APP_NAME =
  "TechLead Hub";

const BACKEND_HOST =
  "127.0.0.1";

const BACKEND_PORT =
  3333;

const APP_URL =
  `http://${BACKEND_HOST}:${BACKEND_PORT}`;

const HEALTH_URL =
  `${APP_URL}/health`;

/*
 * Usamos um endpoint real do dashboard como readiness check.
 * Diferente do /health, ele confirma que o Prisma consegue
 * executar consultas no PostgreSQL.
 */
const READY_URL =
  `${APP_URL}/api/dashboard/summary`;

const BACKEND_START_TIMEOUT =
  30_000;

const DATABASE_READY_TIMEOUT =
  30_000;

const HEALTH_CHECK_INTERVAL =
  400;

const HTTP_REQUEST_TIMEOUT =
  1_500;

const CONFIG_FILENAME =
  "config.env";

const UPDATE_CHANNEL =
  "beta";

const UPDATE_CHECK_DELAY =
  5_000;

/* =========================================================
   TIPOS DE ATUALIZAÇÃO
========================================================= */

type UpdateStatus =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

type UpdateState = {
  status: UpdateStatus;

  currentVersion: string;

  availableVersion:
    | string
    | null;

  percent: number;

  transferred: number;

  total: number;

  bytesPerSecond: number;

  message:
    | string
    | null;
};

/* =========================================================
   ESTADO
========================================================= */

let mainWindow:
  | BrowserWindow
  | null = null;

let backendProcess:
  | ChildProcess
  | null = null;

let isQuitting =
  false;

let startedBackendHere =
  false;

let updaterConfigured =
  false;

let initialUpdateCheckScheduled =
  false;

let updateState:
  UpdateState = {
    status:
      "idle",

    currentVersion:
      app.getVersion(),

    availableVersion:
      null,

    percent:
      0,

    transferred:
      0,

    total:
      0,

    bytesPerSecond:
      0,

    message:
      null,
  };

/* =========================================================
   AUTO UPDATE
========================================================= */

function getAutoUpdater():
  AppUpdater {
  return autoUpdater;
}

function setUpdateState(
  patch:
    Partial<UpdateState>
) {
  updateState = {
    ...updateState,
    ...patch,

    currentVersion:
      app.getVersion(),
  };

  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(
      "updater:state",
      updateState
    );
  }
}

function configureAutoUpdater() {
  if (
    updaterConfigured
  ) {
    return;
  }

  updaterConfigured =
    true;

  if (
    !app.isPackaged
  ) {
    setUpdateState({
      status:
        "disabled",

      message:
        "Atualizações automáticas ficam disponíveis na versão instalada.",
    });

    console.log(
      "[updater] Desabilitado em desenvolvimento."
    );

    return;
  }

  const updater =
    getAutoUpdater();

  /*
   * Fluxo manual:
   * - verifica automaticamente;
   * - avisa o React;
   * - o usuário escolhe quando baixar;
   * - o usuário escolhe quando instalar/reiniciar.
   */
  updater.autoDownload =
    false;

  updater.autoInstallOnAppQuit =
    false;

  updater.allowPrerelease =
    true;

  updater.channel =
    UPDATE_CHANNEL;

  updater.on(
    "checking-for-update",
    () => {
      console.log(
        "[updater] Verificando atualizações..."
      );

      setUpdateState({
        status:
          "checking",

        availableVersion:
          null,

        percent:
          0,

        transferred:
          0,

        total:
          0,

        bytesPerSecond:
          0,

        message:
          "Verificando atualizações...",
      });
    }
  );

  updater.on(
    "update-available",
    (
      info:
        UpdateInfo
    ) => {
      console.log(
        `[updater] Nova versão disponível: ${info.version}`
      );

      setUpdateState({
        status:
          "available",

        availableVersion:
          info.version,

        percent:
          0,

        transferred:
          0,

        total:
          0,

        bytesPerSecond:
          0,

        message:
          `Nova versão ${info.version} disponível.`,
      });
    }
  );

  updater.on(
    "update-not-available",
    (
      info:
        UpdateInfo
    ) => {
      console.log(
        `[updater] Aplicativo atualizado: ${info.version}`
      );

      setUpdateState({
        status:
          "not-available",

        availableVersion:
          null,

        percent:
          0,

        transferred:
          0,

        total:
          0,

        bytesPerSecond:
          0,

        message:
          "Você está usando a versão mais recente.",
      });
    }
  );

  updater.on(
    "download-progress",
    (
      progress:
        ProgressInfo
    ) => {
      const percent =
        Math.max(
          0,
          Math.min(
            100,
            Number(
              progress.percent
                .toFixed(
                  1
                )
            )
          )
        );

      setUpdateState({
        status:
          "downloading",

        percent,

        transferred:
          progress.transferred,

        total:
          progress.total,

        bytesPerSecond:
          progress.bytesPerSecond,

        message:
          `Baixando atualização... ${percent}%`,
      });
    }
  );

  updater.on(
    "update-downloaded",
    (
      info:
        UpdateInfo
    ) => {
      console.log(
        `[updater] Atualização ${info.version} pronta para instalar.`
      );

      setUpdateState({
        status:
          "downloaded",

        availableVersion:
          info.version,

        percent:
          100,

        message:
          "Atualização baixada. Pronta para instalar e reiniciar.",
      });
    }
  );

  updater.on(
    "error",
    (
      error:
        Error
    ) => {
      console.error(
        "[updater] Erro:",
        error
      );

      setUpdateState({
        status:
          "error",

        message:
          error.message ||
          "Não foi possível verificar ou baixar a atualização.",
      });
    }
  );

  console.log(
    `[updater] Configurado. Canal: ${UPDATE_CHANNEL}`
  );
}

async function checkForUpdates() {
  configureAutoUpdater();

  if (
    !app.isPackaged
  ) {
    return updateState;
  }

  if (
    updateState.status ===
      "checking" ||
    updateState.status ===
      "downloading"
  ) {
    return updateState;
  }

  try {
    await getAutoUpdater()
      .checkForUpdates();

    return updateState;
  } catch (error) {
    console.error(
      "[updater] Falha na verificação:",
      error
    );

    setUpdateState({
      status:
        "error",

      message:
        error instanceof Error
          ? error.message
          : "Falha ao verificar atualizações.",
    });

    return updateState;
  }
}

async function downloadUpdate() {
  configureAutoUpdater();

  if (
    !app.isPackaged
  ) {
    return updateState;
  }

  if (
    updateState.status !==
      "available"
  ) {
    return updateState;
  }

  try {
    setUpdateState({
      status:
        "downloading",

      percent:
        0,

      message:
        "Iniciando download da atualização...",
    });

    await getAutoUpdater()
      .downloadUpdate();

    return updateState;
  } catch (error) {
    console.error(
      "[updater] Falha no download:",
      error
    );

    setUpdateState({
      status:
        "error",

      message:
        error instanceof Error
          ? error.message
          : "Falha ao baixar atualização.",
    });

    return updateState;
  }
}

function installDownloadedUpdate() {
  if (
    !app.isPackaged ||
    updateState.status !==
      "downloaded"
  ) {
    return false;
  }

  console.log(
    "[updater] Instalando atualização e reiniciando..."
  );

  isQuitting =
    true;

  stopBackend();

  getAutoUpdater()
    .quitAndInstall(
      false,
      true
    );

  return true;
}

function scheduleInitialUpdateCheck() {
  if (
    !app.isPackaged ||
    initialUpdateCheckScheduled
  ) {
    return;
  }

  initialUpdateCheckScheduled =
    true;

  setTimeout(
    () => {
      void checkForUpdates();
    },
    UPDATE_CHECK_DELAY
  );
}

/* =========================================================
   IPC
========================================================= */

function registerIpcHandlers() {
  ipcMain.removeHandler(
    "app:get-version"
  );

  ipcMain.removeHandler(
    "updater:get-state"
  );

  ipcMain.removeHandler(
    "updater:check"
  );

  ipcMain.removeHandler(
    "updater:download"
  );

  ipcMain.removeHandler(
    "updater:install"
  );

  ipcMain.handle(
    "app:get-version",
    () => {
      return app.getVersion();
    }
  );

  ipcMain.handle(
    "updater:get-state",
    () => {
      return updateState;
    }
  );

  ipcMain.handle(
    "updater:check",
    async () => {
      return checkForUpdates();
    }
  );

  ipcMain.handle(
    "updater:download",
    async () => {
      return downloadUpdate();
    }
  );

  ipcMain.handle(
    "updater:install",
    () => {
      return installDownloadedUpdate();
    }
  );
}

/* =========================================================
   CAMINHOS
========================================================= */

function getBackendRoot() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "backend"
    );
  }

  return path.resolve(
    __dirname,
    "../../backend"
  );
}

function getBackendEntry() {
  return path.join(
    getBackendRoot(),
    "dist",
    "server.js"
  );
}

function getUserConfigDirectory() {
  return app.getPath(
    "userData"
  );
}

function getUserConfigPath() {
  return path.join(
    getUserConfigDirectory(),
    CONFIG_FILENAME
  );
}

function getDevelopmentEnvPath() {
  return path.join(
    getBackendRoot(),
    ".env"
  );
}

/* =========================================================
   CONFIGURAÇÃO DO BANCO
========================================================= */

function parseEnvValue(
  content: string,
  key: string
) {
  const lines =
    content.split(
      /\r?\n/
    );

  for (
    const originalLine of lines
  ) {
    const line =
      originalLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const normalized =
      line.startsWith("export ")
        ? line.slice(
            "export ".length
          )
        : line;

    const separatorIndex =
      normalized.indexOf("=");

    if (
      separatorIndex < 1
    ) {
      continue;
    }

    const currentKey =
      normalized
        .slice(
          0,
          separatorIndex
        )
        .trim();

    if (
      currentKey !== key
    ) {
      continue;
    }

    let value =
      normalized
        .slice(
          separatorIndex + 1
        )
        .trim();

    if (
      value.length >= 2 &&
      (
        (
          value.startsWith('"') &&
          value.endsWith('"')
        ) ||
        (
          value.startsWith("'") &&
          value.endsWith("'")
        )
      )
    ) {
      value =
        value.slice(
          1,
          -1
        );
    }

    return value.trim();
  }

  return null;
}

function readEnvValueFromFile(filePath: string, key: string) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf8");
    return parseEnvValue(content, key) || null;
  } catch (error) {
    console.error(`[desktop] Não foi possível ler ${key} da configuração:`, error);
    return null;
  }
}

function upsertEnvValueInFile(filePath: string, key: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";

  const lines = content ? content.split(/\r?\n/) : [];
  const newLine = `${key}=${JSON.stringify(value)}`;
  let replaced = false;

  const updated = lines.map((originalLine) => {
    const trimmed = originalLine.trim();
    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex < 1) return originalLine;

    const currentKey = normalized.slice(0, separatorIndex).trim();
    if (currentKey !== key) return originalLine;

    replaced = true;
    return newLine;
  });

  while (updated.length > 0 && updated[updated.length - 1] === "") {
    updated.pop();
  }

  if (!replaced) updated.push(newLine);

  fs.writeFileSync(filePath, `${updated.join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function resolveJwtSecret() {
  const fromEnvironment = process.env.JWT_SECRET?.trim();
  if (fromEnvironment) {
    console.log("[desktop] JWT_SECRET recebida pelo ambiente.");
    return fromEnvironment;
  }

  const configPath = getUserConfigPath();
  const saved = readEnvValueFromFile(configPath, "JWT_SECRET");

  if (saved) {
    console.log("[desktop] JWT_SECRET local carregada.");
    return saved;
  }

  if (!app.isPackaged) {
    const development = readEnvValueFromFile(
      getDevelopmentEnvPath(),
      "JWT_SECRET"
    );

    if (development) {
      console.log("[desktop] JWT_SECRET de desenvolvimento carregada.");
      return development;
    }
  }

  const generated = crypto.randomBytes(48).toString("base64url");
  upsertEnvValueInFile(configPath, "JWT_SECRET", generated);

  console.log(
    "[desktop] JWT_SECRET local gerada e persistida com segurança."
  );

  return generated;
}

function readDatabaseUrlFromFile(
  filePath: string
) {
  try {
    if (
      !fs.existsSync(
        filePath
      )
    ) {
      return null;
    }

    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    const value =
      parseEnvValue(
        content,
        "DATABASE_URL"
      );

    return value || null;
  } catch (error) {
    console.error(
      "[desktop] Não foi possível ler a configuração:",
      error
    );

    return null;
  }
}

function saveDatabaseUrl(
  databaseUrl: string
) {
  const configDirectory =
    getUserConfigDirectory();

  const configPath =
    getUserConfigPath();

  fs.mkdirSync(
    configDirectory,
    {
      recursive: true,
    }
  );

  /*
   * Não registramos a URL no console.
   * O arquivo fica fora do instalador e fora do Git,
   * dentro do diretório de dados do usuário.
   */
  upsertEnvValueInFile(
    configPath,
    "DATABASE_URL",
    databaseUrl
  );

  console.log(
    `[desktop] Configuração salva em: ${configPath}`
  );
}

async function askUserForDatabaseConfiguration() {
  const response =
    await dialog.showMessageBox(
      {
        type:
          "info",

        title:
          APP_NAME,

        message:
          "Configuração inicial necessária",

        detail:
          "O TechLead Hub precisa da configuração de conexão com o banco de dados. Selecione um arquivo .env que contenha a variável DATABASE_URL. A configuração será armazenada somente nesta máquina.",

        buttons: [
          "Selecionar arquivo .env",
          "Fechar",
        ],

        defaultId:
          0,

        cancelId:
          1,

        noLink:
          true,
      }
    );

  if (
    response.response !== 0
  ) {
    return null;
  }

  const selection =
    await dialog.showOpenDialog(
      {
        title:
          "Selecionar configuração do TechLead Hub",

        properties: [
          "openFile",
        ],

        filters: [
          {
            name:
              "Arquivos de configuração",

            extensions: [
              "env",
            ],
          },

          {
            name:
              "Todos os arquivos",

            extensions: [
              "*",
            ],
          },
        ],
      }
    );

  if (
    selection.canceled ||
    selection.filePaths.length ===
      0
  ) {
    return null;
  }

  const selectedFile =
    selection.filePaths[0];

  if (!selectedFile) {
    return null;
  }

  const databaseUrl =
    readDatabaseUrlFromFile(
      selectedFile
    );

  if (!databaseUrl) {
    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "DATABASE_URL não encontrada",

        detail:
          "O arquivo selecionado não possui uma variável DATABASE_URL válida.",

        buttons: [
          "Fechar",
        ],
      }
    );

    return null;
  }

  try {
    saveDatabaseUrl(
      databaseUrl
    );

    return databaseUrl;
  } catch (error) {
    console.error(
      "[desktop] Falha ao salvar configuração:",
      error
    );

    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "Não foi possível salvar a configuração.",

        detail:
          "Verifique as permissões da sua conta do Windows e tente novamente.",

        buttons: [
          "Fechar",
        ],
      }
    );

    return null;
  }
}

async function resolveDatabaseUrl() {
  /*
   * 1. Variável já definida no processo.
   * Útil para testes, automação e ambientes corporativos.
   */
  const environmentDatabaseUrl =
    process.env.DATABASE_URL?.trim();

  if (
    environmentDatabaseUrl
  ) {
    console.log(
      "[desktop] DATABASE_URL recebida pelo ambiente."
    );

    return environmentDatabaseUrl;
  }

  /*
   * 2. Configuração persistida pelo aplicativo.
   */
  const savedDatabaseUrl =
    readDatabaseUrlFromFile(
      getUserConfigPath()
    );

  if (savedDatabaseUrl) {
    console.log(
      "[desktop] Configuração local carregada."
    );

    return savedDatabaseUrl;
  }

  /*
   * 3. Em desenvolvimento, aproveitamos backend/.env.
   * Esse arquivo continua fora do Git e do instalador.
   */
  if (
    !app.isPackaged
  ) {
    const developmentDatabaseUrl =
      readDatabaseUrlFromFile(
        getDevelopmentEnvPath()
      );

    if (
      developmentDatabaseUrl
    ) {
      console.log(
        "[desktop] Configuração de desenvolvimento carregada."
      );

      return developmentDatabaseUrl;
    }
  }

  /*
   * 4. Primeira execução do aplicativo empacotado.
   */
  return askUserForDatabaseConfiguration();
}

/* =========================================================
   BACKEND
========================================================= */

function startBackend(
  databaseUrl: string,
  jwtSecret: string
) {
  if (backendProcess) {
    return;
  }

  const backendRoot =
    getBackendRoot();

  const backendEntry =
    getBackendEntry();

  if (
    !fs.existsSync(
      backendEntry
    )
  ) {
    throw new Error(
      `Backend não encontrado em ${backendEntry}`
    );
  }

  console.log(
    "[desktop] Backend:",
    backendEntry
  );

  startedBackendHere =
    true;

  backendProcess =
    spawn(
      process.execPath,
      [
        backendEntry,
      ],
      {
        cwd:
          backendRoot,

        env: {
          ...process.env,

          DATABASE_URL:
            databaseUrl,

          JWT_SECRET:
            jwtSecret,

          ELECTRON_RUN_AS_NODE:
            "1",

          NODE_ENV:
            "production",

          HOST:
            BACKEND_HOST,

          PORT:
            String(
              BACKEND_PORT
            ),
        },

        windowsHide:
          true,

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );

  backendProcess.stdout?.on(
    "data",
    (
      data: Buffer
    ) => {
      const message =
        data
          .toString()
          .trim();

      if (message) {
        console.log(
          `[backend] ${message}`
        );
      }
    }
  );

  backendProcess.stderr?.on(
    "data",
    (
      data: Buffer
    ) => {
      const message =
        data
          .toString()
          .trim();

      if (message) {
        console.error(
          `[backend] ${message}`
        );
      }
    }
  );

  backendProcess.on(
    "error",
    (error) => {
      console.error(
        "[desktop] Falha ao iniciar backend:",
        error
      );
    }
  );

  backendProcess.on(
    "exit",
    (
      code,
      signal
    ) => {
      console.log(
        `[desktop] Backend finalizado. Code=${code}, Signal=${signal}`
      );

      backendProcess =
        null;

      if (
        !isQuitting &&
        code !== 0
      ) {
        console.error(
          "[desktop] Backend foi encerrado inesperadamente."
        );
      }
    }
  );
}

/* =========================================================
   FINALIZAÇÃO DO BACKEND
========================================================= */

function stopBackend() {
  if (
    !backendProcess ||
    !startedBackendHere
  ) {
    return;
  }

  console.log(
    "[desktop] Encerrando backend..."
  );

  try {
    backendProcess.kill();
  } catch (error) {
    console.error(
      "[desktop] Erro ao encerrar backend:",
      error
    );
  }

  backendProcess =
    null;

  startedBackendHere =
    false;
}

/* =========================================================
   HTTP / HEALTH / READINESS
========================================================= */

function requestStatus(
  url: string
) {
  return new Promise<number | null>(
    (resolve) => {
      let settled =
        false;

      const finish = (
        value: number | null
      ) => {
        if (settled) {
          return;
        }

        settled =
          true;

        resolve(value);
      };

      const request =
        http.get(
          url,
          {
            headers: {
              Accept:
                "application/json",
            },
          },
          (response) => {
            response.resume();

            finish(
              response.statusCode ??
                null
            );
          }
        );

      request.setTimeout(
        HTTP_REQUEST_TIMEOUT,
        () => {
          request.destroy();

          finish(null);
        }
      );

      request.on(
        "error",
        () => {
          finish(null);
        }
      );
    }
  );
}

async function checkBackendHealth() {
  const status =
    await requestStatus(
      HEALTH_URL
    );

  return Boolean(
    status &&
    status >= 200 &&
    status < 300
  );
}

async function checkBackendReady() {
  const status =
    await requestStatus(
      READY_URL
    );

  return Boolean(
    status &&
    status >= 200 &&
    status < 300
  );
}

async function waitFor(
  check: () => Promise<boolean>,
  timeout: number
) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    timeout
  ) {
    if (
      await check()
    ) {
      return true;
    }

    await delay(
      HEALTH_CHECK_INTERVAL
    );
  }

  return false;
}

function waitForBackendHealth() {
  return waitFor(
    checkBackendHealth,
    BACKEND_START_TIMEOUT
  );
}

function waitForBackendReady() {
  return waitFor(
    checkBackendReady,
    DATABASE_READY_TIMEOUT
  );
}

function delay(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

/* =========================================================
   JANELA PRINCIPAL
========================================================= */

function isInternalUrl(
  rawUrl: string
) {
  try {
    const target =
      new URL(rawUrl);

    const appOrigin =
      new URL(
        APP_URL
      ).origin;

    return (
      target.origin ===
      appOrigin
    );
  } catch {
    return false;
  }
}

function isExternalHttpUrl(
  rawUrl: string
) {
  try {
    const target =
      new URL(rawUrl);

    return (
      target.protocol ===
        "http:" ||
      target.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

function getWindowMetrics() {
  const display =
    screen.getPrimaryDisplay();

  const {
    width,
    height,
  } =
    display.workAreaSize;

  const compactScreen =
    width < 1600 ||
    height < 900;

  return {
    width:
      Math.min(
        1440,
        Math.max(
          1100,
          Math.floor(
            width * 0.94
          )
        )
      ),

    height:
      Math.min(
        900,
        Math.max(
          700,
          Math.floor(
            height * 0.94
          )
        )
      ),

    zoomFactor:
      compactScreen
        ? 0.9
        : 1,
  };
}

function createWindow() {
  const metrics =
    getWindowMetrics();

  mainWindow =
    new BrowserWindow({
      width:
        metrics.width,

      height:
        metrics.height,

      minWidth:
        1024,

      minHeight:
        650,

      show:
        false,

      title:
        APP_NAME,

      backgroundColor:
        "#f5f7fa",

      autoHideMenuBar:
        true,

      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,

        webSecurity:
          true,
      },
    });

  /*
   * Mantém o layout mais confortável em notebooks menores,
   * equivalente ao zoom de 90% que já vinha funcionando bem.
   */
  mainWindow.webContents.setZoomFactor(
    metrics.zoomFactor
  );

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      if (
        isExternalHttpUrl(
          url
        )
      ) {
        void shell.openExternal(
          url
        );
      }

      return {
        action:
          "deny",
      };
    }
  );

  mainWindow.webContents.on(
    "will-navigate",
    (
      event,
      url
    ) => {
      if (
        isInternalUrl(
          url
        )
      ) {
        return;
      }

      event.preventDefault();

      if (
        isExternalHttpUrl(
          url
        )
      ) {
        void shell.openExternal(
          url
        );
      }
    }
  );

  mainWindow.webContents.on(
    "render-process-gone",
    (
      _event,
      details
    ) => {
      console.error(
        "[desktop] Renderer encerrado:",
        details.reason
      );
    }
  );

  void mainWindow
    .loadURL(
      APP_URL
    )
    .catch(
      async (
        error
      ) => {
        console.error(
          "[desktop] Falha ao carregar interface:",
          error
        );

        await dialog.showMessageBox(
          {
            type:
              "error",

            title:
              APP_NAME,

            message:
              "Não foi possível carregar a interface.",

            detail:
              "O backend iniciou, mas a interface do TechLead Hub não pôde ser carregada.",

            buttons: [
              "Fechar",
            ],
          }
        );

        app.quit();
      }
    );

  mainWindow.once(
    "ready-to-show",
    () => {
      mainWindow?.show();

      mainWindow?.focus();

      mainWindow
        ?.webContents
        .send(
          "updater:state",
          updateState
        );
    }
  );

  mainWindow.on(
    "closed",
    () => {
      mainWindow =
        null;
    }
  );
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function bootstrap() {
  console.log(
    `[desktop] Iniciando ${APP_NAME} ${app.getVersion()}...`
  );

  /*
   * Garante um segredo persistente para autenticação do backend.
   * Instalações antigas são migradas automaticamente.
   */
  const jwtSecret =
    resolveJwtSecret();

  /*
   * Se já houver uma instância válida do backend na porta 3333
   * e ela conseguir consultar o banco, apenas reutilizamos.
   */
  const backendAlreadyReady =
    await checkBackendReady();

  if (
    backendAlreadyReady
  ) {
    console.log(
      "[desktop] Backend já estava online e conectado ao banco."
    );

    createWindow();

    scheduleInitialUpdateCheck();

    return;
  }

  const databaseUrl =
    await resolveDatabaseUrl();

  if (!databaseUrl) {
    await dialog.showMessageBox(
      {
        type:
          "warning",

        title:
          APP_NAME,

        message:
          "Configuração do banco não informada.",

        detail:
          "O TechLead Hub será encerrado. Ao abrir novamente, você poderá selecionar o arquivo de configuração.",

        buttons: [
          "Fechar",
        ],
      }
    );

    app.quit();

    return;
  }

  startBackend(
    databaseUrl,
    jwtSecret
  );

  const backendOnline =
    await waitForBackendHealth();

  if (
    !backendOnline
  ) {
    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "Não foi possível iniciar o TechLead Hub.",

        detail:
          `O backend não respondeu na porta ${BACKEND_PORT} dentro do tempo esperado.`,

        buttons: [
          "Fechar",
        ],
      }
    );

    app.quit();

    return;
  }

  console.log(
    "[desktop] Backend online. Validando banco de dados..."
  );

  const databaseReady =
    await waitForBackendReady();

  if (
    !databaseReady
  ) {
    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "Não foi possível conectar ao banco de dados.",

        detail:
          "O backend foi iniciado, mas o PostgreSQL não respondeu corretamente. Verifique a DATABASE_URL, a rede/VPN e a disponibilidade do banco.",

        buttons: [
          "Fechar",
        ],
      }
    );

    app.quit();

    return;
  }

  console.log(
    "[desktop] Backend e banco de dados prontos."
  );

  createWindow();

  scheduleInitialUpdateCheck();
}

/* =========================================================
   INSTÂNCIA ÚNICA
========================================================= */

const gotSingleInstanceLock =
  app.requestSingleInstanceLock();

if (
  !gotSingleInstanceLock
) {
  app.quit();
} else {
  app.on(
    "second-instance",
    () => {
      if (
        !mainWindow
      ) {
        return;
      }

      if (
        mainWindow.isMinimized()
      ) {
        mainWindow.restore();
      }

      mainWindow.show();

      mainWindow.focus();
    }
  );

  app
    .whenReady()
    .then(
      async () => {
        registerIpcHandlers();

        configureAutoUpdater();

        await bootstrap();
      }
    )
    .catch(
      async (
        error
      ) => {
        console.error(
          "[desktop] Erro durante inicialização:",
          error
        );

        await dialog.showMessageBox(
          {
            type:
              "error",

            title:
              APP_NAME,

            message:
              "O TechLead Hub não conseguiu iniciar.",

            detail:
              error instanceof Error
                ? error.message
                : String(
                    error
                  ),

            buttons: [
              "Fechar",
            ],
          }
        );

        app.quit();
      }
    );

  app.on(
    "activate",
    () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {
        void checkBackendReady()
          .then(
            (
              ready
            ) => {
              if (ready) {
                createWindow();
              } else {
                return bootstrap();
              }
            }
          );
      }
    }
  );
}

/* =========================================================
   ENCERRAMENTO
========================================================= */

app.on(
  "before-quit",
  () => {
    isQuitting =
      true;

    stopBackend();
  }
);

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);