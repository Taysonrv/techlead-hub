import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
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
 * Endpoint público e mínimo de readiness.
 *
 * O /health confirma que o processo HTTP está online.
 * O /health/ready confirma, adicionalmente, que o Prisma
 * consegue executar uma consulta no PostgreSQL.
 *
 * Não usamos endpoints do dashboard aqui porque toda a área
 * /api é autenticada.
 */
const READY_URL =
  `${APP_URL}/health/ready`;

const BACKEND_START_TIMEOUT =
  30_000;

const DATABASE_READY_TIMEOUT =
  30_000;

const HEALTH_CHECK_INTERVAL =
  400;

const HTTP_REQUEST_TIMEOUT =
  1_500;

/*
 * Arquivo legado das versões anteriores.
 *
 * Ele permanece somente para migração automática.
 * DATABASE_URL e JWT_SECRET não são mais persistidos aqui.
 */
const CONFIG_FILENAME =
  "config.env";

/*
 * Arquivo persistente com os valores criptografados pelo
 * safeStorage do Electron.
 *
 * No Windows, o Electron usa a proteção nativa do sistema
 * operacional para manter os segredos vinculados ao usuário.
 */
const SECURE_CONFIG_FILENAME =
  "secure-config.json";

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

let setupWindow:
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

  ipcMain.removeHandler("configuration:get");
  ipcMain.removeHandler("configuration:import-env");
  ipcMain.removeHandler("configuration:save");

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

  ipcMain.handle("configuration:get", () => {
    const azure = resolveAzureConfiguration();
    const email = resolveEmailConfiguration();

    return {
      databaseConfigured: Boolean(readSecureValue("databaseUrl") || process.env.DATABASE_URL),
      organization: azure.organization,
      project: azure.project,
      wiki: azure.wiki,
      patConfigured: Boolean(azure.pat),
      smtpHost: email.host,
      smtpPort: email.port,
      smtpSecure: email.secure === "true",
      smtpUser: email.user,
      smtpFrom: email.from,
      smtpPasswordConfigured: Boolean(email.password),
      emailConfigured: Boolean(
        email.host &&
        email.port &&
        email.user &&
        email.password &&
        email.from
      ),
    };
  });

  ipcMain.handle("configuration:import-env", async () => {
    return selectConfigurationFile();
  });

  ipcMain.handle("configuration:save", async (_event, input: unknown) => {
    const result = saveApplicationConfiguration(input);

    if (mainWindow) {
      setTimeout(() => {
        isQuitting = true;
        stopBackend();
        app.relaunch();
        app.exit(0);
      }, 500);
    }

    return result;
  });
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

function getSecureConfigPath() {
  return path.join(
    getUserConfigDirectory(),
    SECURE_CONFIG_FILENAME
  );
}

function getDevelopmentEnvPath() {
  return path.join(
    getBackendRoot(),
    ".env"
  );
}

/* =========================================================
   CONFIGURAÇÃO SEGURA
========================================================= */

type SecureConfig = {
  version: 1;

  databaseUrl?: string;

  jwtSecret?: string;

  azureOrganization?: string;
  azureProject?: string;
  azureWiki?: string;
  azurePat?: string;

  smtpHost?: string;
  smtpPort?: string;
  smtpSecure?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
};

type SecureConfigKey =
  | "databaseUrl"
  | "jwtSecret"
  | "azureOrganization"
  | "azureProject"
  | "azureWiki"
  | "azurePat"
  | "smtpHost"
  | "smtpPort"
  | "smtpSecure"
  | "smtpUser"
  | "smtpPassword"
  | "smtpFrom";

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

function readEnvValueFromFile(
  filePath: string,
  key: string
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

    return (
      parseEnvValue(
        content,
        key
      ) ||
      null
    );
  } catch (error) {
    console.error(
      `[desktop] Não foi possível ler ${key} da configuração:`,
      error
    );

    return null;
  }
}

function removeEnvValueFromFile(
  filePath: string,
  key: string
) {
  try {
    if (
      !fs.existsSync(
        filePath
      )
    ) {
      return;
    }

    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    const lines =
      content.split(
        /\r?\n/
      );

    const filtered =
      lines.filter(
        (
          originalLine
        ) => {
          const trimmed =
            originalLine.trim();

          if (
            !trimmed ||
            trimmed.startsWith("#")
          ) {
            return true;
          }

          const normalized =
            trimmed.startsWith(
              "export "
            )
              ? trimmed.slice(
                  "export ".length
                )
              : trimmed;

          const separatorIndex =
            normalized.indexOf(
              "="
            );

          if (
            separatorIndex < 1
          ) {
            return true;
          }

          const currentKey =
            normalized
              .slice(
                0,
                separatorIndex
              )
              .trim();

          return (
            currentKey !==
            key
          );
        }
      );

    const meaningfulLines =
      filtered.filter(
        (line) =>
          line.trim()
      );

    if (
      meaningfulLines.length ===
      0
    ) {
      fs.rmSync(
        filePath,
        {
          force: true,
        }
      );

      return;
    }

    fs.writeFileSync(
      filePath,
      `${filtered
        .join("\n")
        .replace(
          /\n+$/,
          ""
        )}\n`,
      {
        encoding:
          "utf8",

        mode:
          0o600,
      }
    );
  } catch (error) {
    /*
     * A remoção do legado é uma etapa de limpeza.
     * Se falhar, não interrompemos a inicialização.
     */
    console.warn(
      `[desktop] Não foi possível remover ${key} da configuração legada:`,
      error
    );
  }
}

function ensureSecureStorageAvailable() {
  if (
    safeStorage
      .isEncryptionAvailable()
  ) {
    return;
  }

  throw new Error(
    "A proteção segura de credenciais do Windows não está disponível nesta sessão."
  );
}

function readSecureConfig():
  SecureConfig {
  const secureConfigPath =
    getSecureConfigPath();

  if (
    !fs.existsSync(
      secureConfigPath
    )
  ) {
    return {
      version:
        1,
    };
  }

  try {
    const content =
      fs.readFileSync(
        secureConfigPath,
        "utf8"
      );

    const parsed =
      JSON.parse(
        content
      ) as
        Partial<SecureConfig>;

    return {
      version:
        1,

      databaseUrl:
        typeof parsed.databaseUrl ===
        "string"
          ? parsed.databaseUrl
          : undefined,

      jwtSecret:
        typeof parsed.jwtSecret ===
        "string"
          ? parsed.jwtSecret
          : undefined,

      azureOrganization:
        typeof parsed.azureOrganization === "string"
          ? parsed.azureOrganization
          : undefined,
      azureProject:
        typeof parsed.azureProject === "string"
          ? parsed.azureProject
          : undefined,
      azureWiki:
        typeof parsed.azureWiki === "string"
          ? parsed.azureWiki
          : undefined,
      azurePat:
        typeof parsed.azurePat === "string"
          ? parsed.azurePat
          : undefined,

      smtpHost:
        typeof parsed.smtpHost === "string"
          ? parsed.smtpHost
          : undefined,
      smtpPort:
        typeof parsed.smtpPort === "string"
          ? parsed.smtpPort
          : undefined,
      smtpSecure:
        typeof parsed.smtpSecure === "string"
          ? parsed.smtpSecure
          : undefined,
      smtpUser:
        typeof parsed.smtpUser === "string"
          ? parsed.smtpUser
          : undefined,
      smtpPassword:
        typeof parsed.smtpPassword === "string"
          ? parsed.smtpPassword
          : undefined,
      smtpFrom:
        typeof parsed.smtpFrom === "string"
          ? parsed.smtpFrom
          : undefined,
    };
  } catch (error) {
    console.error(
      "[desktop] Não foi possível ler a configuração segura:",
      error
    );

    return {
      version:
        1,
    };
  }
}

function writeSecureConfig(
  config:
    SecureConfig
) {
  ensureSecureStorageAvailable();

  const secureConfigPath =
    getSecureConfigPath();

  fs.mkdirSync(
    path.dirname(
      secureConfigPath
    ),
    {
      recursive:
        true,
    }
  );

  fs.writeFileSync(
    secureConfigPath,
    `${JSON.stringify(
      config,
      null,
      2
    )}\n`,
    {
      encoding:
        "utf8",

      mode:
        0o600,
    }
  );
}

function encryptSecret(
  value: string
) {
  ensureSecureStorageAvailable();

  return safeStorage
    .encryptString(
      value
    )
    .toString(
      "base64"
    );
}

function decryptSecret(
  encryptedValue: string
) {
  ensureSecureStorageAvailable();

  return safeStorage
    .decryptString(
      Buffer.from(
        encryptedValue,
        "base64"
      )
    );
}

function readSecureValue(
  key:
    SecureConfigKey
) {
  const config =
    readSecureConfig();

  const encryptedValue =
    config[key];

  if (
    !encryptedValue
  ) {
    return null;
  }

  try {
    return decryptSecret(
      encryptedValue
    );
  } catch (error) {
    console.error(
      `[desktop] Não foi possível descriptografar ${key}:`,
      error
    );

    return null;
  }
}

function saveSecureValue(
  key:
    SecureConfigKey,
  value: string
) {
  const config =
    readSecureConfig();

  config[key] =
    encryptSecret(
      value
    );

  writeSecureConfig(
    config
  );
}

function migrateLegacyEnvValue(
  envKey: string,
  secureKey:
    SecureConfigKey
) {
  const legacyConfigPath =
    getUserConfigPath();

  const legacyValue =
    readEnvValueFromFile(
      legacyConfigPath,
      envKey
    );

  if (
    !legacyValue
  ) {
    return null;
  }

  saveSecureValue(
    secureKey,
    legacyValue
  );

  /*
   * Só removemos o valor em texto puro depois que a cópia
   * criptografada foi persistida com sucesso.
   */
  removeEnvValueFromFile(
    legacyConfigPath,
    envKey
  );

  console.log(
    `[desktop] ${envKey} migrada para o armazenamento seguro.`
  );

  return legacyValue;
}

function resolveJwtSecret() {
  /*
   * 1. Ambiente explícito.
   *
   * Útil para desenvolvimento e automação. Não persistimos
   * automaticamente valores recebidos pelo processo.
   */
  const fromEnvironment =
    process.env.JWT_SECRET
      ?.trim();

  if (
    fromEnvironment
  ) {
    console.log(
      "[desktop] JWT_SECRET recebida pelo ambiente."
    );

    return fromEnvironment;
  }

  /*
   * 2. Armazenamento seguro.
   */
  const secureSecret =
    readSecureValue(
      "jwtSecret"
    );

  if (
    secureSecret
  ) {
    console.log(
      "[desktop] JWT_SECRET segura carregada."
    );

    return secureSecret;
  }

  /*
   * 3. Migração automática de versões anteriores.
   */
  const migratedSecret =
    migrateLegacyEnvValue(
      "JWT_SECRET",
      "jwtSecret"
    );

  if (
    migratedSecret
  ) {
    return migratedSecret;
  }

  /*
   * 4. Desenvolvimento.
   */
  if (
    !app.isPackaged
  ) {
    const developmentSecret =
      readEnvValueFromFile(
        getDevelopmentEnvPath(),
        "JWT_SECRET"
      );

    if (
      developmentSecret
    ) {
      console.log(
        "[desktop] JWT_SECRET de desenvolvimento carregada."
      );

      return developmentSecret;
    }
  }

  /*
   * 5. Nova instalação.
   *
   * Cada instalação mantém um segredo local próprio.
   * Os JWTs emitidos por essa máquina são validados pelo
   * backend local dessa mesma instalação.
   */
  const generated =
    crypto
      .randomBytes(
        48
      )
      .toString(
        "base64url"
      );

  saveSecureValue(
    "jwtSecret",
    generated
  );

  console.log(
    "[desktop] JWT_SECRET local gerada e protegida pelo sistema operacional."
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

    return (
      value ||
      null
    );
  } catch (error) {
    console.error(
      "[desktop] Não foi possível ler a configuração de banco:",
      error
    );

    return null;
  }
}

function saveDatabaseUrl(
  databaseUrl: string
) {
  saveSecureValue(
    "databaseUrl",
    databaseUrl
  );

  console.log(
    "[desktop] Conexão com o banco armazenada de forma protegida."
  );
}

type AzureConfiguration = {
  organization: string;
  project: string;
  wiki: string;
  pat: string;
};

function resolveAzureConfiguration(): AzureConfiguration {
  const read = (
    envName: string,
    secureKey: SecureConfigKey,
  ) =>
    process.env[envName]?.trim() ||
    readSecureValue(secureKey) ||
    migrateLegacyEnvValue(envName, secureKey) ||
    (!app.isPackaged
      ? readEnvValueFromFile(getDevelopmentEnvPath(), envName)
      : null) ||
    "";

  return {
    organization: read("AZURE_DEVOPS_ORGANIZATION", "azureOrganization"),
    project: read("AZURE_DEVOPS_PROJECT", "azureProject"),
    wiki: read("AZURE_DEVOPS_WIKI", "azureWiki"),
    pat: read("AZURE_DEVOPS_PAT", "azurePat"),
  };
}

type EmailConfiguration = {
  host: string;
  port: string;
  secure: string;
  user: string;
  password: string;
  from: string;
};

function resolveEmailConfiguration(): EmailConfiguration {
  const read = (
    envName: string,
    secureKey: SecureConfigKey,
  ) =>
    process.env[envName]?.trim() ||
    readSecureValue(secureKey) ||
    migrateLegacyEnvValue(envName, secureKey) ||
    (!app.isPackaged
      ? readEnvValueFromFile(getDevelopmentEnvPath(), envName)
      : null) ||
    "";

  return {
    host: read("SMTP_HOST", "smtpHost"),
    port: read("SMTP_PORT", "smtpPort") || "587",
    secure: read("SMTP_SECURE", "smtpSecure") || "false",
    user: read("SMTP_USER", "smtpUser"),
    password: read("SMTP_PASSWORD", "smtpPassword"),
    from: read("SMTP_FROM", "smtpFrom"),
  };
}

type ConfigurationInput = {
  databaseUrl?: unknown;
  organization?: unknown;
  project?: unknown;
  wiki?: unknown;
  pat?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  smtpUser?: unknown;
  smtpPassword?: unknown;
  smtpFrom?: unknown;
};

type ConfigurationValues = {
  databaseUrl: string;
  organization: string;
  project: string;
  wiki: string;
  pat: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: string;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
};

function normalizeConfigurationInput(input: unknown): ConfigurationValues {
  if (!input || typeof input !== "object") {
    throw new Error("Configuração inválida.");
  }

  const value = input as ConfigurationInput;
  const text = (candidate: unknown) =>
    typeof candidate === "string" ? candidate.trim() : "";

  return {
    databaseUrl: text(value.databaseUrl),
    organization: text(value.organization),
    project: text(value.project),
    wiki: text(value.wiki),
    pat: text(value.pat),
    smtpHost: text(value.smtpHost),
    smtpPort: text(value.smtpPort) || "587",
    smtpSecure: text(value.smtpSecure) || "false",
    smtpUser: text(value.smtpUser),
    smtpPassword: text(value.smtpPassword),
    smtpFrom: text(value.smtpFrom),
  };
}

function saveApplicationConfiguration(input: unknown) {
  const value = normalizeConfigurationInput(input);

  const databaseUrl =
    value.databaseUrl ||
    readSecureValue("databaseUrl") ||
    process.env.DATABASE_URL?.trim() ||
    "";

  const existingAzure = resolveAzureConfiguration();
  const pat = value.pat || existingAzure.pat;

  const existingEmail = resolveEmailConfiguration();
  const smtpPassword =
    value.smtpPassword ||
    existingEmail.password;

  if (
    !databaseUrl ||
    !/^postgres(?:ql)?:\/\//i.test(databaseUrl)
  ) {
    throw new Error("Informe uma DATABASE_URL PostgreSQL válida.");
  }

  const azureFields = [value.organization, value.project, value.wiki, pat];
  const hasSomeAzure = azureFields.some(Boolean);
  const hasAllAzure = azureFields.every(Boolean);

  if (hasSomeAzure && !hasAllAzure) {
    throw new Error("Preencha Organização, Projeto, Wiki e PAT, ou deixe todos os campos do Azure vazios.");
  }

  const emailFields = [
    value.smtpHost,
    value.smtpPort,
    value.smtpUser,
    smtpPassword,
    value.smtpFrom,
  ];
  const hasSomeEmail = emailFields.some(Boolean);
  const hasAllEmail = emailFields.every(Boolean);
  const smtpPort = Number(value.smtpPort);

  if (
    hasSomeEmail &&
    (
      !hasAllEmail ||
      !Number.isInteger(smtpPort) ||
      smtpPort < 1 ||
      smtpPort > 65535
    )
  ) {
    throw new Error("Preencha servidor, porta, usuário, senha e remetente do e-mail com valores válidos.");
  }

  saveSecureValue("databaseUrl", databaseUrl);

  if (hasAllAzure) {
    saveSecureValue("azureOrganization", value.organization);
    saveSecureValue("azureProject", value.project);
    saveSecureValue("azureWiki", value.wiki);
    saveSecureValue("azurePat", pat);
  }

  if (hasAllEmail) {
    saveSecureValue("smtpHost", value.smtpHost);
    saveSecureValue("smtpPort", value.smtpPort);
    saveSecureValue("smtpSecure", value.smtpSecure);
    saveSecureValue("smtpUser", value.smtpUser);
    saveSecureValue("smtpPassword", smtpPassword);
    saveSecureValue("smtpFrom", value.smtpFrom);
  }

  return { success: true, restartRequired: Boolean(mainWindow) };
}

async function selectConfigurationFile() {
  const selection = await dialog.showOpenDialog({
    title: "Importar configuração do TechLead Hub",
    properties: ["openFile"],
    filters: [
      { name: "Arquivo de ambiente", extensions: ["env"] },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });

  const selectedFile = selection.filePaths[0];

  if (selection.canceled || !selectedFile) {
    return null;
  }

  const content = fs.readFileSync(selectedFile, "utf8");

  return {
    databaseUrl: parseEnvValue(content, "DATABASE_URL") || "",
    organization: parseEnvValue(content, "AZURE_DEVOPS_ORGANIZATION") || "",
    project: parseEnvValue(content, "AZURE_DEVOPS_PROJECT") || "",
    wiki: parseEnvValue(content, "AZURE_DEVOPS_WIKI") || "",
    pat: parseEnvValue(content, "AZURE_DEVOPS_PAT") || "",
  };
}

async function showIntegratedSetup(): Promise<string | null> {
  return new Promise((resolve) => {
    setupWindow = new BrowserWindow({
      width: 760,
      height: 720,
      minWidth: 680,
      minHeight: 620,
      show: false,
      autoHideMenuBar: true,
      title: `${APP_NAME} - Configuração inicial`,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Configuração inicial</title><style>
      *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f6f8;color:#101828}.page{max-width:720px;margin:auto;padding:32px}.card{background:white;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 8px 28px rgba(16,24,40,.08)}h1{margin:0 0 6px;font-size:25px}.lead{color:#667085;margin:0 0 24px}.section{border-top:1px solid #eaecf0;padding-top:20px;margin-top:20px}label{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}input{width:100%;padding:11px 12px;border:1px solid #d0d5dd;border-radius:9px;font-size:14px}small{color:#667085}.actions{display:flex;gap:10px;margin-top:24px}.button{border:0;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:#18c77a;color:#071a12}.secondary{background:#fff;border:1px solid #18c77a;color:#087443}.error{display:none;margin-top:16px;padding:11px;border-radius:8px;background:#fef3f2;color:#b42318}.optional{font-weight:400;color:#667085}
    </style></head><body><main class="page"><section class="card"><h1>Bem-vindo ao TechLead Hub</h1><p class="lead">Para concluir a primeira instalação, conecte o aplicativo ao banco de dados. Essa informação será solicitada somente uma vez e ficará protegida pelo Windows.</p><button class="button secondary" id="import">Importar arquivo .env</button><div class="section"><h3>Conexão principal</h3><label>DATABASE_URL</label><input id="databaseUrl" type="password" autocomplete="off" placeholder="postgresql://usuario:senha@servidor:5432/banco"><small>Depois do primeiro acesso, configure o Azure DevOps em Administração &gt; Configurações.</small></div><div id="error" class="error"></div><div class="actions"><button class="button primary" id="save">Conectar e abrir o aplicativo</button></div></section></main><script>
      const ids=['databaseUrl'];const error=document.getElementById('error');
      document.getElementById('import').onclick=async()=>{const data=await window.techLeadHub.configuration.importEnv();if(data){ids.forEach(id=>document.getElementById(id).value=data[id]||'')}};
      document.getElementById('save').onclick=async()=>{error.style.display='none';try{const data={};ids.forEach(id=>data[id]=document.getElementById(id).value);await window.techLeadHub.configuration.save(data);window.close()}catch(e){error.textContent=e?.message||String(e);error.style.display='block'}};
    </script></body></html>`;

    setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    setupWindow.once("ready-to-show", () => setupWindow?.show());
    setupWindow.on("closed", () => {
      setupWindow = null;
      resolve(readSecureValue("databaseUrl"));
    });
  });
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
          "Selecione o arquivo de provisionamento .env fornecido para o TechLead Hub. A conexão com o banco será importada e armazenada de forma criptografada pelo Windows nesta conta de usuário.",

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
    response.response !==
      0
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

  if (
    !selectedFile
  ) {
    return null;
  }

  const databaseUrl =
    readDatabaseUrlFromFile(
      selectedFile
    );

  if (
    !databaseUrl
  ) {
    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "DATABASE_URL não encontrada",

        detail:
          "O arquivo selecionado não possui uma configuração DATABASE_URL válida.",

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

    await dialog.showMessageBox(
      {
        type:
          "info",

        title:
          APP_NAME,

        message:
          "Configuração importada com sucesso",

        detail:
          "A conexão foi armazenada de forma protegida nesta conta do Windows. O arquivo de provisionamento pode ser removido da máquina após esta configuração.",

        buttons: [
          "Continuar",
        ],
      }
    );

    return databaseUrl;
  } catch (error) {
    console.error(
      "[desktop] Falha ao proteger a configuração:",
      error
    );

    await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "Não foi possível proteger a configuração.",

        detail:
          "A proteção segura de credenciais do Windows não está disponível ou não pôde ser utilizada. Nenhuma credencial será gravada em texto puro pelo aplicativo.",

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
   * 1. Variável recebida pelo processo.
   */
  const environmentDatabaseUrl =
    process.env.DATABASE_URL
      ?.trim();

  if (
    environmentDatabaseUrl
  ) {
    console.log(
      "[desktop] DATABASE_URL recebida pelo ambiente."
    );

    return environmentDatabaseUrl;
  }

  /*
   * 2. Armazenamento seguro.
   */
  const secureDatabaseUrl =
    readSecureValue(
      "databaseUrl"
    );

  if (
    secureDatabaseUrl
  ) {
    console.log(
      "[desktop] Configuração segura do banco carregada."
    );

    return secureDatabaseUrl;
  }

  /*
   * 3. Migração automática das versões antigas que
   * mantinham DATABASE_URL em config.env.
   */
  const migratedDatabaseUrl =
    migrateLegacyEnvValue(
      "DATABASE_URL",
      "databaseUrl"
    );

  if (
    migratedDatabaseUrl
  ) {
    return migratedDatabaseUrl;
  }

  /*
   * 4. Desenvolvimento: backend/.env continua permitido.
   *
   * O arquivo não é empacotado e permanece fora do Git.
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
   * 5. Primeira execução da versão instalada.
   */
  return showIntegratedSetup();
}

/* =========================================================
   BACKEND
========================================================= */

function startBackend(
  databaseUrl: string,
  jwtSecret: string,
  azure: AzureConfiguration,
  email: EmailConfiguration,
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

          AZURE_DEVOPS_ORGANIZATION:
            azure.organization,

          AZURE_DEVOPS_PROJECT:
            azure.project,

          AZURE_DEVOPS_WIKI:
            azure.wiki,

          AZURE_DEVOPS_PAT:
            azure.pat,

          SMTP_HOST:
            email.host,
          SMTP_PORT:
            email.port,
          SMTP_SECURE:
            email.secure,
          SMTP_USER:
            email.user,
          SMTP_PASSWORD:
            email.password,
          SMTP_FROM:
            email.from,
          PASSWORD_RESET_URL:
            `http://localhost:${BACKEND_PORT}/login`,

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
    jwtSecret,
    resolveAzureConfiguration(),
    resolveEmailConfiguration(),
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
    const response = await dialog.showMessageBox(
      {
        type:
          "error",

        title:
          APP_NAME,

        message:
          "Não foi possível conectar ao banco de dados.",

        detail:
          "O backend foi iniciado, mas o PostgreSQL não respondeu corretamente. Verifique a DATABASE_URL, a rede/VPN e a disponibilidade do banco.",

        buttons: ["Reconfigurar", "Fechar"],
        defaultId: 0,
        cancelId: 1,
      }
    );

    stopBackend();

    if (response.response === 0) {
      const correctedDatabaseUrl = await showIntegratedSetup();

      if (correctedDatabaseUrl) {
        isQuitting = true;
        app.relaunch();
        app.exit(0);
        return;
      }
    }

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
