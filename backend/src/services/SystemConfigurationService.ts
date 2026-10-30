import crypto from "node:crypto";
import axios from "axios";
import { prisma } from "../database/prisma";
import { azureCollection, azureFailureMessage } from "./AzureDevOpsResponse";
import { azureDevOpsConfiguration, azureRequestOptions } from "./AzureDevOpsClient";
import { checkAzureMonthlyAccess } from "./AzureDevOpsHistoricalCheckService";

const SETTING_ENV = {
  organization: "AZURE_DEVOPS_ORGANIZATION",
  project: "AZURE_DEVOPS_PROJECT",
  wiki: "AZURE_DEVOPS_WIKI",
  pat: "AZURE_DEVOPS_PAT",
  movideskToken: "MOVIDESK_TOKEN",
  movideskUrl: "MOVIDESK_URL",
  teamsSupportTicketsEnabled: "TEAMS_SUPPORT_NEW_TICKETS_ENABLED",
  teamsSupportTicketsWebhook: "TEAMS_SUPPORT_NEW_TICKETS_WEBHOOK_URL",
  teamsTaskCreatedEnabled: "TEAMS_AZURE_TASK_CREATED_ENABLED",
  teamsTaskCreatedWebhook: "TEAMS_AZURE_TASK_CREATED_WEBHOOK_URL",
  teamsTaskRegistroEnabled: "TEAMS_AZURE_TASK_REGISTRO_ENABLED",
  teamsTaskRegistroWebhook: "TEAMS_AZURE_TASK_REGISTRO_WEBHOOK_URL",
  teamsTicketBaseUrl: "TEAMS_TICKET_BASE_URL",
} as const;

export type SystemConfigurationInput = Partial<Record<keyof typeof SETTING_ENV, string>>;
export type SystemConfigurationTestInput = SystemConfigurationInput & { integration?: "azure" | "movidesk"; reportMonth?: string };
export type TeamsWorkflowSettingsInput = Partial<{
  supportTicketsEnabled: boolean;
  supportTicketsWebhookUrl: string;
  taskCreatedEnabled: boolean;
  taskCreatedWebhookUrl: string;
  taskRegistroEnabled: boolean;
  taskRegistroWebhookUrl: string;
  ticketBaseUrl: string;
}>;

type SettingRow = { key: string; value: string };

function normalizeMovideskToken(raw: string) {
  let value = raw.trim();
  const urlToken = value.match(/[?&]token=([^&#\s]+)/i)?.[1];
  if (urlToken) value = urlToken;
  value = value.replace(/^token\s*=\s*/i, "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) value = value.slice(1, -1).trim();
  return value;
}

class SystemConfigurationService {
  private encryptionKey() {
    // Configurações compartilhadas entre instâncias não podem depender do
    // JWT_SECRET local, pois esse segredo pode variar por instalação/usuário.
    // JWT_SECRET continua sendo aceito apenas no fluxo de leitura legado.
    const secret = process.env.SYSTEM_CONFIG_KEY?.trim();
    if (!secret || secret.length < 32) {
      throw new Error(
        "SYSTEM_CONFIG_KEY compartilhada é obrigatória para salvar configurações centrais. " +
        "Configure o mesmo segredo persistente em todas as instâncias que acessam este banco. " +
        "JWT_SECRET não pode ser usada para novas gravações."
      );
    }
    return crypto.createHash("sha256").update(secret).digest();
  }

  private encrypt(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
  }

  private decrypt(value: string) {
    const secrets = [
      process.env.SYSTEM_CONFIG_KEY?.trim(),
      process.env.JWT_SECRET?.trim(),
    ].filter((secret): secret is string => Boolean(secret && secret.length >= 32));
    const tried = new Set<string>();
    for (const secret of secrets) {
      if (tried.has(secret)) continue;
      tried.add(secret);
      try {
        return this.decryptWithSecret(value, secret);
      } catch {
        // Tentar a próxima chave legada disponível sem registrar segredos.
      }
    }
    throw new Error("Configuração criptografada incompatível com as chaves disponíveis.");
  }

  private decryptWithSecret(value: string, secret: string) {
    const [version, iv, tag, encrypted] = value.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Configuração central inválida.");
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  }

  private validateWorkflowWebhook(value: string): string {
    if (value.trim().length > 4096) throw new Error("A URL do Workflow do Teams excede o tamanho permitido.");
    let url: URL;
    try { url = new URL(value.trim()); }
    catch { throw new Error("Informe uma URL válida do Workflow do Teams."); }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("A URL do Workflow do Teams deve usar HTTPS e não pode conter usuário ou senha.");
    }
    return url.toString();
  }

  private validateTicketBaseUrl(value: string): string {
    if (value.trim().length > 2048) throw new Error("A URL base do Movidesk excede o tamanho permitido.");
    let url: URL;
    try { url = new URL(value.trim()); }
    catch { throw new Error("Informe uma URL válida para o Movidesk."); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("A URL base do Movidesk deve usar HTTPS e não pode conter usuário, senha, consulta ou fragmento.");
    }
    return url.toString().replace(/\/$/, "");
  }

  private async saveEncryptedSettings(
    values: Array<[keyof typeof SETTING_ENV, string]>,
    updatedById: number,
    action: string,
  ) {
    if (!values.length) return;
    const entries = values.map(([key, value]) => ({ key, value: this.encrypt(value) }));
    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.$executeRaw`
          INSERT INTO "SystemSetting" ("key", "value", "encrypted", "updatedAt", "updatedById")
          VALUES (${entry.key}, ${entry.value}, TRUE, CURRENT_TIMESTAMP, ${updatedById})
          ON CONFLICT ("key") DO UPDATE SET
            "value" = EXCLUDED."value",
            "encrypted" = TRUE,
            "updatedAt" = CURRENT_TIMESTAMP,
            "updatedById" = EXCLUDED."updatedById"
        `;
      }
      await tx.auditLog.create({
        data: { userId: updatedById, action, entity: "SystemSetting", metadata: { keys: entries.map(({ key }) => key) } },
      });
    });
    for (const [key, value] of values) process.env[SETTING_ENV[key]] = value;
  }

  // A chave candidata pode abrir registros diretamente; outros podem depender
  // exclusivamente da JWT_SECRET desta instalação. A validação informa se a
  // candidata foi comprovada pelo banco ou se haverá recriptografia explícita
  // dos registros legados que ainda são legíveis localmente.
  async validateRecoveryKey(candidate: string) {
    if (candidate.length < 32 || candidate.length > 4096) return { valid: false, candidateVerified: false };
    const rows = await prisma.$queryRaw<SettingRow[]>`
      SELECT "key", "value" FROM "SystemSetting"
    `;
    const known = rows.filter(row => Object.prototype.hasOwnProperty.call(SETTING_ENV, row.key));
    if (!known.length) return { valid: false, candidateVerified: false };
    const fallbackSecrets = [process.env.SYSTEM_CONFIG_KEY?.trim(), process.env.JWT_SECRET?.trim()]
      .filter((secret): secret is string => Boolean(secret && secret.length >= 32 && secret !== candidate));
    let openedWithCandidate = 0;
    for (const row of known) {
      let readable = false;
      try {
        this.decryptWithSecret(row.value, candidate);
        openedWithCandidate += 1;
        readable = true;
      } catch { /* Tentar as chaves de compatibilidade desta instalação. */ }
      if (!readable) {
        for (const secret of fallbackSecrets) {
          try {
            this.decryptWithSecret(row.value, secret);
            readable = true;
            break;
          } catch { /* Continuar apenas com as chaves já disponíveis. */ }
        }
      }
      if (!readable) return { valid: false, candidateVerified: false };
    }
    return { valid: true, candidateVerified: openedWithCandidate > 0 };
  }

  async loadIntoEnvironment() {
    const rows = await prisma.$queryRawUnsafe<SettingRow[]>(`SELECT "key", "value" FROM "SystemSetting"`);
    const persistedKeys = new Set<string>();
    const resolved: Array<{ envName: string; value: string }> = [];
    const legacyRows: Array<{ key: string; originalValue: string; value: string }> = [];
    const sharedKey = process.env.SYSTEM_CONFIG_KEY?.trim();
    for (const row of rows) {
      const envName = SETTING_ENV[row.key as keyof typeof SETTING_ENV];
      if (!envName) continue;
      try {
        const value = this.decrypt(row.value);
        resolved.push({ envName, value });
        if (sharedKey && sharedKey.length >= 32) {
          try {
            this.decryptWithSecret(row.value, sharedKey);
          } catch {
            legacyRows.push({ key: row.key, originalValue: row.value, value: this.encrypt(value) });
          }
        }
      } catch {
        // Não expor valores criptografados, segredos ou detalhes de autenticação.
        // Uma chave de instalação diferente não deve provocar carregamento parcial.
        throw new Error(`Falha ao descriptografar a configuração '${row.key}'. Confira se SYSTEM_CONFIG_KEY/JWT_SECRET corresponde à chave utilizada quando a credencial foi salva. Nenhuma configuração foi alterada.`);
      }
      persistedKeys.add(row.key);
    }
    if (legacyRows.length) {
      await prisma.$transaction(async (tx) => {
        for (const row of legacyRows) {
          await tx.$executeRaw`
            UPDATE "SystemSetting"
            SET "value" = ${row.value}, "encrypted" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "key" = ${row.key} AND "value" = ${row.originalValue}
          `;
        }
      });
    }
    for (const entry of resolved) process.env[entry.envName] = entry.value;
    process.env.APP_INTEGRATIONS_CONFIG_STATUS = "ready";
    return persistedKeys;
  }

  async status() {
    const persistedKeys = await this.loadIntoEnvironment();
    return {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      organization: process.env.AZURE_DEVOPS_ORGANIZATION ?? "",
      project: process.env.AZURE_DEVOPS_PROJECT ?? "",
      wiki: process.env.AZURE_DEVOPS_WIKI ?? "",
      patConfigured: Boolean(process.env.AZURE_DEVOPS_PAT),
      azureCredentialSource: persistedKeys.has("pat") ? "central" : process.env.AZURE_DEVOPS_PAT?.trim() ? "environment" : "missing",
      movideskConfigured: Boolean(process.env.MOVIDESK_TOKEN),
      movideskUrl: process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1",
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
      teamsWorkflows: {
        supportTicketsEnabled: process.env.TEAMS_SUPPORT_NEW_TICKETS_ENABLED?.trim().toLowerCase() === "true",
        supportTicketsWebhookConfigured: Boolean(process.env.TEAMS_SUPPORT_NEW_TICKETS_WEBHOOK_URL?.trim()),
        taskCreatedEnabled: process.env.TEAMS_AZURE_TASK_CREATED_ENABLED?.trim().toLowerCase() === "true",
        taskCreatedWebhookConfigured: Boolean(process.env.TEAMS_AZURE_TASK_CREATED_WEBHOOK_URL?.trim()),
        taskRegistroEnabled: process.env.TEAMS_AZURE_TASK_REGISTRO_ENABLED?.trim().toLowerCase() === "true",
        taskRegistroWebhookConfigured: Boolean(process.env.TEAMS_AZURE_TASK_REGISTRO_WEBHOOK_URL?.trim()),
        ticketBaseUrlConfigured: Boolean(process.env.TEAMS_TICKET_BASE_URL?.trim()),
        ticketBaseUrl: process.env.TEAMS_TICKET_BASE_URL?.trim() ?? "",
      },
    };
  }

  async saveTeamsWorkflowSettings(input: TeamsWorkflowSettingsInput, updatedById: number) {
    await this.loadIntoEnvironment();
    const updates: Array<[keyof typeof SETTING_ENV, string]> = [];
    if (input.ticketBaseUrl?.trim()) updates.push(["teamsTicketBaseUrl", this.validateTicketBaseUrl(input.ticketBaseUrl)]);
    const processInputs = [
      { enabled: input.supportTicketsEnabled, webhook: input.supportTicketsWebhookUrl, enabledKey: "teamsSupportTicketsEnabled", webhookKey: "teamsSupportTicketsWebhook", label: "aviso de tickets novos" },
      { enabled: input.taskCreatedEnabled, webhook: input.taskCreatedWebhookUrl, enabledKey: "teamsTaskCreatedEnabled", webhookKey: "teamsTaskCreatedWebhook", label: "aviso de task criada" },
      { enabled: input.taskRegistroEnabled, webhook: input.taskRegistroWebhookUrl, enabledKey: "teamsTaskRegistroEnabled", webhookKey: "teamsTaskRegistroWebhook", label: "aviso de retorno ao Registro" },
    ] as const;

    for (const item of processInputs) {
      if (item.enabled !== undefined) {
        if (typeof item.enabled !== "boolean") throw new Error("Os controles dos processos Teams devem ser booleanos.");
        updates.push([item.enabledKey, String(item.enabled)]);
      }
      if (item.webhook?.trim()) updates.push([item.webhookKey, this.validateWorkflowWebhook(item.webhook)]);
    }

    const effectiveValue = (key: keyof typeof SETTING_ENV) =>
      updates.find(([candidate]) => candidate === key)?.[1] ?? process.env[SETTING_ENV[key]] ?? "";
    for (const item of processInputs) {
      const enabledKey = item.enabledKey;
      const webhookKey = item.webhookKey;
      if (effectiveValue(enabledKey) === "true" && !effectiveValue(webhookKey).trim()) {
        throw new Error(`Configure a URL do Workflow antes de ativar o ${item.label}.`);
      }
    }
    if (processInputs.some((item) => effectiveValue(item.enabledKey) === "true")) {
      if (!effectiveValue("teamsTicketBaseUrl").trim()) throw new Error("Configure a URL base do Movidesk antes de ativar os fluxos do Teams.");
      this.validateTicketBaseUrl(effectiveValue("teamsTicketBaseUrl"));
    }

    await this.saveEncryptedSettings(updates, updatedById, "TEAMS_WORKFLOW_SETTINGS_UPDATED");
    return this.status();
  }

  private async validateAzureCandidate(input: SystemConfigurationInput) {
    const configuration = azureDevOpsConfiguration(input);
    const { organization, project, pat } = configuration;
    if (!organization || !project || !pat) throw new Error("Azure DevOps: organização, projeto e PAT são obrigatórios para validar a conexão.");
    const options = azureRequestOptions(configuration);
    try {
      // WIQL is a POST-only endpoint in Azure DevOps. Use a minimal valid
      // query so the credential is tested against the same Work Items API
      // consumed by the synchronization service.
      const response=await axios.post(
        `${options.baseURL}/_apis/wit/wiql`,
        { query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC" },
        {
          ...options,
          params: { "api-version": "7.1", "$top": "1" },
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );
      azureCollection(response,"workItems","teste de conexão");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) throw new Error("Azure DevOps rejeitou o novo PAT (HTTP 401). A credencial atual foi preservada.");
        if (status === 403) throw new Error("O novo PAT não possui permissão suficiente no Azure DevOps (HTTP 403). A credencial atual foi preservada.");
        throw new Error(`${azureFailureMessage(error)} A configuração atual foi preservada.`);
      }
      throw error;
    }
    return { ok: true, organization, project };
  }

  private async validateMovideskCandidate(input: SystemConfigurationInput) {
    const rawToken = input.movideskToken?.trim();
    const token = rawToken ? normalizeMovideskToken(rawToken) : process.env.MOVIDESK_TOKEN?.trim() || "";
    const url = (input.movideskUrl?.trim() || process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1").replace(/\/$/, "");
    if (!token) throw new Error("Movidesk: informe um token antes de validar.");
    const request = async (mode: "BEARER" | "QUERY") => {
      const params: Record<string, string> = { "$select": "id,lastUpdate", "$top": "1" };
      if (mode === "QUERY") params.token = token;
      return axios.get(`${url}/tickets`, {
        params,
        headers: mode === "BEARER" ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 15_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });
    };
    try {
      await request("BEARER");
      return { ok: true, endpoint: url, authentication: "BEARER" };
    } catch (bearerError) {
      if (!axios.isAxiosError(bearerError) || bearerError.response?.status !== 401) {
        throw new Error(`Movidesk rejeitou a nova configuração${axios.isAxiosError(bearerError) && bearerError.response?.status ? ` (HTTP ${bearerError.response.status})` : ""}. O token atual foi preservado.`);
      }
    }
    try {
      await request("QUERY");
      return { ok: true, endpoint: url, authentication: "QUERY" };
    } catch (queryError) {
      const status = axios.isAxiosError(queryError) ? queryError.response?.status : undefined;
      throw new Error(`Movidesk rejeitou o novo token${status ? ` (HTTP ${status})` : ""}. O token atual foi preservado.`);
    }
  }

  async test(input: SystemConfigurationTestInput) {
    const persistedKeys = await this.loadIntoEnvironment();
    const result: Record<string, unknown> = {};
    if (input.integration === "azure" || input.reportMonth || input.pat?.trim() || input.organization?.trim() || input.project?.trim()) {
      const azure = await this.validateAzureCandidate(input);
      result.azure = { ...azure, credentialSource: input.pat?.trim() ? "candidate" : persistedKeys.has("pat") ? "central" : "environment",
        ...(input.reportMonth ? { history: await checkAzureMonthlyAccess(azureDevOpsConfiguration(input), input.reportMonth) } : {}) };
    }
    if (input.integration === "movidesk" || input.movideskToken?.trim() || input.movideskUrl?.trim()) result.movidesk = await this.validateMovideskCandidate(input);
    if (!Object.keys(result).length) throw new Error("Selecione a integração que deseja testar.");
    return result;
  }

  async save(input: SystemConfigurationInput, updatedById: number) {
    await this.loadIntoEnvironment();
    // Validate replacement credentials before writing anything. A rejected candidate
    // must never overwrite a known-good integration credential.
    const azureRequested = Boolean(input.pat?.trim() || input.organization?.trim() || input.project?.trim());
    const azure = azureRequested ? azureDevOpsConfiguration(input) : null;
    let currentAzure: ReturnType<typeof azureDevOpsConfiguration> | null = null;
    try { if (azureRequested) currentAzure = azureDevOpsConfiguration(); }
    catch { /* A valid replacement must be able to repair an invalid saved URL. */ }
    if (azure && (input.pat?.trim() || azure.organization !== currentAzure?.organization || azure.project !== currentAzure?.project))
      await this.validateAzureCandidate(input);
    if (input.movideskToken?.trim()) await this.validateMovideskCandidate(input);

    const changedKeys: string[] = [];
    for (const key of Object.keys(SETTING_ENV) as Array<keyof typeof SETTING_ENV>) {
      const rawValue = input[key]?.trim();
      if (!rawValue) continue;
      const value = key === "movideskToken" ? normalizeMovideskToken(rawValue) : key === "organization" ? azure!.organization : key === "project" ? azure!.project : rawValue;
      if (!value) continue;
      const encrypted = this.encrypt(value);
      await prisma.$executeRaw`
        INSERT INTO "SystemSetting" ("key", "value", "encrypted", "updatedAt", "updatedById")
        VALUES (${key}, ${encrypted}, TRUE, CURRENT_TIMESTAMP, ${updatedById})
        ON CONFLICT ("key") DO UPDATE SET
          "value" = EXCLUDED."value",
          "encrypted" = TRUE,
          "updatedAt" = CURRENT_TIMESTAMP,
          "updatedById" = EXCLUDED."updatedById"
      `;
      process.env[SETTING_ENV[key]] = value;
      changedKeys.push(key);
    }
    if (changedKeys.length) {
      await prisma.auditLog.create({
        data: { userId: updatedById, action: "SYSTEM_SETTINGS_UPDATED", entity: "SystemSetting", metadata: { keys: changedKeys } },
      });
    }
    return this.status();
  }
}

export const systemConfigurationService = new SystemConfigurationService();
