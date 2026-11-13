export type LegacyAttachment = { name: string; mimeType: string; size: number; href: string };

export function parseLegacyAttachment(content: string): LegacyAttachment | null {
  if (!content.startsWith("[anexo] ")) return null;
  const parts = content.slice(8).split("|");
  if (parts.length < 4) return null;
  const [name, mimeType, size, ...base64] = parts;
  const parsedSize = Number(size);
  if (!name || !mimeType || !Number.isFinite(parsedSize) || parsedSize < 0 || !base64.length) return null;
  return { name, mimeType, size: parsedSize, href: `data:${mimeType};base64,${base64.join("|")}` };
}

