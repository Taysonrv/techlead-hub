export function parseEnvironmentValue(content: string, key: string): string | null {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  for (const originalLine of normalizedContent.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex < 1 || normalized.slice(0, separatorIndex).trim() !== key) continue;

    let value = normalized.slice(separatorIndex + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return null;
}

export function selectSystemConfigKey(options: {
  packaged: boolean;
  environmentValue?: string | null;
  secureValue?: string | null;
}): string {
  const environmentValue = options.environmentValue?.trim() ?? "";
  const secureValue = options.secureValue?.trim() ?? "";
  return options.packaged
    ? secureValue || environmentValue
    : environmentValue || secureValue;
}
