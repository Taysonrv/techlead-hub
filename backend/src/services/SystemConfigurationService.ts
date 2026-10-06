import crypto from "node:crypto";
import axios from "axios";
import { prisma } from "../database/prisma";

const SETTING_ENV = {
  organization: "AZURE_DEVOPS_ORGANIZATION",
  project: "AZURE_DEVOPS_PROJECT",
  wiki: "AZURE_DEVOPS_WIKI",
  pat: "AZURE_DEVOPS_PAT",
  movideskToken: "MOVIDESK_TOKEN",
  movideskUrl: "MOVIDESK_URL",
} as const;

export type SystemConfigurationInput = Partial<Record<keyof typeof SETTING_ENV, string>>;

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
    const secret = process.env.SYSTEM_CONFIG_KEY?.trim() || process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new Error("SYSTEM_CONFIG_KEY ou JWT_SECRET seguro é obrigatório para proteger configurações centrais.");
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
    const [version, iv, tag, encrypted] = value.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Configuração central inválida.");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  }

  async loadIntoEnvironment() {
    const rows = await prisma.$queryRawUnsafe<SettingRow[]>(`SELECT "key", "value" FROM "SystemSetting"`);
    for (const row of rows) {
      const envName = SETTING_ENV[row.key as keyof typeof SETTING_ENV];
      if (envName) process.env[envName] = this.decrypt(row.value);
    }
  }

  async status() {
    await this.loadIntoEnvironment();
    return {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      organization: process.env.AZURE_DEVOPS_ORGANIZATION ?? "",
      project: process.env.AZURE_DEVOPS_PROJECT ?? "",
      wiki: process.env.AZURE_DEVOPS_WIKI ?? "",
      patConfigured: Boolean(process.env.AZURE_DEVOPS_PAT),
      movideskConfigured: Boolean(process.env.MOVIDESK_TOKEN),
      movideskUrl: process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1",
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
    };
  }

  private async validateAzureCandidate(input: SystemConfigurationInput) {
    const organization = input.organization?.trim() || process.env.AZURE_DEVOPS_ORGANIZATION?.trim() || "";
    const project = input.project?.trim() || process.env.AZURE_DEVOPS_PROJECT?.trim() || "";
    const pat = input.pat?.trim() || process.env.AZURE_DEVOPS_PAT?.trim() || "";
    if (!organization || !project || !pat) throw new Error("Azure DevOps: organização, projeto e PAT são obrigatórios para validar a conexão.");
    const auth = Buffer.from(`:${pat}`, "utf8").toString("base64");
    try {
      await axios.get(`https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/wiql`, {
        headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
        params: { "api-version": "7.1" },
        timeout: 15_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) throw new Error("Azure DevOps rejeitou o novo PAT (HTTP 401). A credencial atual foi preservada.");
        if (status === 403) throw new Error("O novo PAT não possui permissão suficiente no Azure DevOps (HTTP 403). A credencial atual foi preservada.");
        throw new Error(`Não foi possível validar o Azure DevOps${status ? ` (HTTP ${status})` : ""}. A configuração atual foi preservada.`);
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

  async test(input: SystemConfigurationInput) {
    await this.loadIntoEnvironment();
    const result: Record<string, unknown> = {};
    if (input.pat?.trim() || input.organization?.trim() || input.project?.trim()) result.azure = await this.validateAzureCandidate(input);
    if (input.movideskToken?.trim() || input.movideskUrl?.trim()) result.movidesk = await this.validateMovideskCandidate(input);
    return result;
  }

  async save(input: SystemConfigurationInput, updatedById: number) {
    await this.loadIntoEnvironment();
    // Validate replacement credentials before writing anything. A rejected candidate
    // must never overwrite a known-good integration credential.
    if (input.pat?.trim()) await this.validateAzureCandidate(input);
    if (input.movideskToken?.trim()) await this.validateMovideskCandidate(input);

    const changedKeys: string[] = [];
    for (const key of Object.keys(SETTING_ENV) as Array<keyof typeof SETTING_ENV>) {
      const rawValue = input[key]?.trim();
      if (!rawValue) continue;
      const value = key === "movideskToken" ? normalizeMovideskToken(rawValue) : rawValue;
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
