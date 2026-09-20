import axios from "axios";
import crypto from "node:crypto";
import { prisma } from "../database/prisma";

type DeviceSession = {
  deviceCode: string;
  expiresAt: number;
  intervalMs: number;
};

type TokenState = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  account?: string;
};

export type KnowledgeHit = {
  source: "sharepoint" | "bpmn";
  title: string;
  excerpt: string;
  webUrl: string | null;
  modifiedAt: string | null;
};

export class MicrosoftKnowledgeService {
  private readonly scopes = "openid profile email offline_access User.Read Sites.Read.All Files.Read.All Tasks.Read Calendars.ReadBasic Team.ReadBasic.All Channel.ReadBasic.All";
  private readonly tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  private readonly clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  private readonly sharePointSite = process.env.SHAREPOINT_SITE_URL?.trim() ?? "";
  private readonly bpmnSite = process.env.SHAREPOINT_BPMN_SITE_URL?.trim() ?? "";
  private readonly sessions = new Map<string, DeviceSession>();
  private readonly tokens = new Map<number, TokenState>();

  async status(userId: number) {
    await this.restoreConnection(userId);
    const token = this.tokens.get(userId);
    const connected = Boolean(token && (token.expiresAt > Date.now() + 30_000 || token.refreshToken));
    return {
      configured: Boolean(this.tenantId && this.clientId),
      connected,
      account: connected ? token?.account ?? null : null,
      sharePointSite: this.sharePointSite || null,
      bpmnSite: this.bpmnSite || null,
    };
  }

  async startConnection(userId: number) {
    this.ensureConfigured();
    const body = new URLSearchParams({
      client_id: this.clientId,
      scope: this.scopes,
    });
    const response = await axios.post(
      `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/devicecode`,
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 },
    );
    const connectionId = crypto.randomUUID();
    this.sessions.set(`${userId}:${connectionId}`, {
      deviceCode: response.data.device_code,
      expiresAt: Date.now() + Number(response.data.expires_in ?? 900) * 1000,
      intervalMs: Math.max(Number(response.data.interval ?? 5), 3) * 1000,
    });
    return {
      connectionId,
      userCode: response.data.user_code,
      verificationUri: response.data.verification_uri,
      message: response.data.message,
      expiresIn: response.data.expires_in,
      interval: response.data.interval,
    };
  }

  async finishConnection(userId: number, connectionId: string) {
    const key = `${userId}:${connectionId}`;
    const session = this.sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      throw Object.assign(new Error("A conexão expirou. Inicie novamente."), { statusCode: 410 });
    }
    try {
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.clientId,
        device_code: session.deviceCode,
      });
      const response = await axios.post(
        `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
        body.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 },
      );
      this.tokens.set(userId, {
        accessToken: response.data.access_token,
        expiresAt: Date.now() + Number(response.data.expires_in ?? 3600) * 1000,
        refreshToken: response.data.refresh_token,
      });
      this.sessions.delete(key);
      const profile = await this.graphGet(userId, "/v1.0/me?$select=displayName,userPrincipalName,mail");
      const account = profile.mail || profile.userPrincipalName || profile.displayName || null;
      const token = this.tokens.get(userId);
      if (token) {
        token.account = account;
        await this.persistConnection(userId, token);
      }
      return { connected: true, account };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error === "authorization_pending") {
        return { connected: false, pending: true, retryAfterMs: session.intervalMs };
      }
      throw this.microsoftError(error, "Não foi possível concluir a autenticação Microsoft.");
    }
  }

  async disconnect(userId: number) {
    this.tokens.delete(userId);
    await prisma.$executeRaw`DELETE FROM "MicrosoftUserConnection" WHERE "userId" = ${userId}`;
    return { connected: false };
  }

  async search(userId: number, query: string, source: "all" | "sharepoint" | "bpmn" = "all") {
    const text = query.trim();
    if (text.length < 3) throw Object.assign(new Error("Informe ao menos 3 caracteres."), { statusCode: 400 });
    const sites = [
      ...(source !== "bpmn" && this.sharePointSite ? [{ source: "sharepoint" as const, url: this.sharePointSite }] : []),
      ...(source !== "sharepoint" && this.bpmnSite ? [{ source: "bpmn" as const, url: this.bpmnSite }] : []),
    ];
    const result = await Promise.all(sites.map(async (site) => {
      const response = await this.graphPost(userId, "/v1.0/search/query", {
        requests: [{
          entityTypes: ["driveItem"],
          query: { queryString: `${text.replace(/["\\]/g, " ")} path:\"${site.url}\"` },
          from: 0,
          size: 12,
          fields: ["name", "webUrl", "lastModifiedDateTime"],
        }],
      });
      const hits = response.value?.[0]?.hitsContainers?.flatMap((container: any) => container.hits ?? []) ?? [];
      return hits.map((hit: any): KnowledgeHit => ({
        source: site.source,
        title: hit.resource?.name || hit.resource?.displayName || "Conteúdo sem título",
        excerpt: String(hit.summary || "Conteúdo localizado no Microsoft 365.").replace(/<[^>]+>/g, ""),
        webUrl: hit.resource?.webUrl || null,
        modifiedAt: hit.resource?.lastModifiedDateTime || null,
      }));
    }));
    return result.flat();
  }

  async coordinationSnapshot(userId: number) {
    if (!(await this.status(userId)).connected) return { connected: false, plannerTasks: [], events: [], teams: [], warnings: [] as string[] };
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const warnings: string[] = [];
    const [planner, calendar, teams] = await Promise.allSettled([
      this.graphGet(userId, "/v1.0/me/planner/tasks?$select=id,title,percentComplete,dueDateTime,planId"),
      this.graphGet(userId, `/v1.0/me/calendarView?startDateTime=${encodeURIComponent(now.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$select=id,subject,start,end,webLink&$orderby=start/dateTime&$top=20`),
      this.graphGet(userId, "/v1.0/me/joinedTeams?$select=id,displayName,webUrl"),
    ]);
    if (planner.status === "rejected") warnings.push("Planner indisponível ou sem consentimento.");
    if (calendar.status === "rejected") warnings.push("Calendário Outlook indisponível ou sem consentimento.");
    if (teams.status === "rejected") warnings.push("Teams indisponível ou sem consentimento.");
    return {
      connected: true,
      plannerTasks: planner.status === "fulfilled" ? (planner.value.value ?? []).slice(0, 50) : [],
      events: calendar.status === "fulfilled" ? calendar.value.value ?? [] : [],
      teams: teams.status === "fulfilled" ? teams.value.value ?? [] : [],
      warnings,
    };
  }

  private ensureConfigured() {
    if (!this.tenantId || !this.clientId) {
      throw Object.assign(new Error("Microsoft 365 aguardando Tenant ID e Client ID nas Configurações."), { statusCode: 503 });
    }
  }

  private async token(userId: number) {
    await this.restoreConnection(userId);
    const token = this.tokens.get(userId);
    if (!token) {
      throw Object.assign(new Error("Conecte sua conta Microsoft para consultar SharePoint e BPMN."), { statusCode: 401 });
    }
    if (token.expiresAt <= Date.now() + 60_000 && token.refreshToken) {
      try {
        const body = new URLSearchParams({
          client_id: this.clientId,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
          scope: this.scopes,
        });
        const response = await axios.post(
          `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
          body.toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 },
        );
        token.accessToken = response.data.access_token;
        token.expiresAt = Date.now() + Number(response.data.expires_in ?? 3600) * 1000;
        token.refreshToken = response.data.refresh_token || token.refreshToken;
        await this.persistConnection(userId, token);
      } catch {
        this.tokens.delete(userId);
      }
    }
    if (token.expiresAt <= Date.now() + 30_000 || !this.tokens.has(userId)) {
      this.tokens.delete(userId);
      throw Object.assign(new Error("Conecte sua conta Microsoft para consultar SharePoint e BPMN."), { statusCode: 401 });
    }
    return token.accessToken;
  }

  private encryptionKey() {
    const secret = process.env.SYSTEM_CONFIG_KEY?.trim() || process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32) throw new Error("Chave segura da aplicação indisponível.");
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
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Sessão Microsoft inválida.");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  }

  private async persistConnection(userId: number, token: TokenState) {
    if (!token.refreshToken) return;
    const encrypted = this.encrypt(token.refreshToken);
    await prisma.$executeRaw`
      INSERT INTO "MicrosoftUserConnection" ("userId", "refreshToken", "account", "connectedAt", "updatedAt")
      VALUES (${userId}, ${encrypted}, ${token.account ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "refreshToken" = EXCLUDED."refreshToken",
        "account" = EXCLUDED."account",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }

  private async restoreConnection(userId: number) {
    if (this.tokens.has(userId)) return;
    const rows = await prisma.$queryRaw<Array<{ refreshToken: string; account: string | null }>>`
      SELECT "refreshToken", "account" FROM "MicrosoftUserConnection" WHERE "userId" = ${userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return;
    try {
      this.tokens.set(userId, {
        accessToken: "",
        expiresAt: 0,
        refreshToken: this.decrypt(row.refreshToken),
        account: row.account ?? undefined,
      });
    } catch {
      await prisma.$executeRaw`DELETE FROM "MicrosoftUserConnection" WHERE "userId" = ${userId}`;
    }
  }

  private async graphGet(userId: number, path: string) {
    const response = await axios.get(`https://graph.microsoft.com${path}`, { headers: { Authorization: `Bearer ${await this.token(userId)}` }, timeout: 20_000 });
    return response.data;
  }

  private async graphPost(userId: number, path: string, data: unknown) {
    const response = await axios.post(`https://graph.microsoft.com${path}`, data, { headers: { Authorization: `Bearer ${await this.token(userId)}` }, timeout: 25_000 });
    return response.data;
  }

  private microsoftError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error_description || error.response?.data?.error?.message || fallback;
      return Object.assign(new Error(message), { statusCode: error.response?.status || 502 });
    }
    return error instanceof Error ? error : new Error(fallback);
  }
}

export const microsoftKnowledgeService = new MicrosoftKnowledgeService();
