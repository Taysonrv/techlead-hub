import crypto from "node:crypto";
import { prisma } from "../database/prisma";

const SETTING_ENV = {
  organization: "AZURE_DEVOPS_ORGANIZATION",
  project: "AZURE_DEVOPS_PROJECT",
  wiki: "AZURE_DEVOPS_WIKI",
  pat: "AZURE_DEVOPS_PAT",
  tenantId: "MICROSOFT_TENANT_ID",
  clientId: "MICROSOFT_CLIENT_ID",
  sharePointSiteUrl: "SHAREPOINT_SITE_URL",
  bpmnSiteUrl: "SHAREPOINT_BPMN_SITE_URL",
} as const;

export type SystemConfigurationInput = Partial<Record<keyof typeof SETTING_ENV, string>>;

type SettingRow = { key: string; value: string };

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
      tenantId: process.env.MICROSOFT_TENANT_ID ?? "",
      clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
      sharePointSiteUrl: process.env.SHAREPOINT_SITE_URL ?? "",
      bpmnSiteUrl: process.env.SHAREPOINT_BPMN_SITE_URL ?? "",
      microsoftConfigured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
    };
  }

  async save(input: SystemConfigurationInput, updatedById: number) {
    for (const key of Object.keys(SETTING_ENV) as Array<keyof typeof SETTING_ENV>) {
      const value = input[key]?.trim();
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
    }
    return this.status();
  }
}

export const systemConfigurationService = new SystemConfigurationService();
