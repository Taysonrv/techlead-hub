import axios from "axios";
import crypto from "node:crypto";

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
  private readonly tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  private readonly clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  private readonly sharePointSite = process.env.SHAREPOINT_SITE_URL?.trim() ?? "";
  private readonly bpmnSite = process.env.SHAREPOINT_BPMN_SITE_URL?.trim() ?? "";
  private readonly sessions = new Map<string, DeviceSession>();
  private readonly tokens = new Map<number, TokenState>();

  status(userId: number) {
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
      scope: "openid profile email offline_access User.Read Sites.Read.All Files.Read.All",
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
      if (token) token.account = account;
      return { connected: true, account };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error === "authorization_pending") {
        return { connected: false, pending: true, retryAfterMs: session.intervalMs };
      }
      throw this.microsoftError(error, "Não foi possível concluir a autenticação Microsoft.");
    }
  }

  disconnect(userId: number) {
    this.tokens.delete(userId);
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

  private ensureConfigured() {
    if (!this.tenantId || !this.clientId) {
      throw Object.assign(new Error("Microsoft 365 aguardando Tenant ID e Client ID nas Configurações."), { statusCode: 503 });
    }
  }

  private async token(userId: number) {
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
          scope: "openid profile email offline_access User.Read Sites.Read.All Files.Read.All",
        });
        const response = await axios.post(
          `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
          body.toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 },
        );
        token.accessToken = response.data.access_token;
        token.expiresAt = Date.now() + Number(response.data.expires_in ?? 3600) * 1000;
        token.refreshToken = response.data.refresh_token || token.refreshToken;
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
