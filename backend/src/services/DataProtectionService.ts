const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "chave privada", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { label: "token Bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { label: "segredo JWT", pattern: /\bJWT_SECRET\s*=\s*\S+/i },
  { label: "string de conexão", pattern: /\b(?:DATABASE_URL|connectionString)\s*[:=]\s*\S+/i },
  { label: "token de acesso", pattern: /\b(?:pat|token|client_secret|api[_-]?key)\s*[:=]\s*[A-Za-z0-9._~+/=-]{16,}/i },
];

export class DataProtectionService {
  normalizeText(value: unknown, maximumLength = 4_000) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maximumLength);
  }

  assertNoSecrets(value: string) {
    const finding = SECRET_PATTERNS.find(({ pattern }) => pattern.test(value));
    if (finding) {
      throw Object.assign(
        new Error(`A mensagem parece conter ${finding.label}. Remova credenciais e tente novamente.`),
        { statusCode: 422, code: "SENSITIVE_DATA_DETECTED" },
      );
    }
  }

  mentionUsernames(value: string) {
    return [...new Set(
      [...value.matchAll(/(^|\s)@([A-Za-z0-9._-]{2,50})\b/g)]
        .map((match) => match[2])
        .filter((username): username is string => Boolean(username))
        .map((username) => username.toLocaleLowerCase("pt-BR")),
    )];
  }

  redact(value: unknown): unknown {
    if (typeof value === "string") {
      return SECRET_PATTERNS.reduce((text, item) => text.replace(item.pattern, `[REMOVIDO: ${item.label}]`), value);
    }
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|secret|token|authorization|pat/i.test(key) ? "[REMOVIDO]" : this.redact(item)]));
    }
    return value;
  }
}

export const dataProtectionService = new DataProtectionService();
