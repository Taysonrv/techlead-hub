import { prisma } from "../database/prisma";

type MapRow = { id: number; sourceFile: string; mapName: string; nodeText: string; path: string; depth: number; parentPath: string | null; importedAt: Date };

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function parseMap(xml: string, sourceFile: string) {
  const mapName = sourceFile.replace(/\.mm$/i, "");
  const token = /<node\b[^>]*\bTEXT="([^"]*)"[^>]*>|<\/node>/gi;
  const stack: string[] = [];
  const rows: Array<{ sourceFile: string; mapName: string; nodeText: string; path: string; depth: number; parentPath: string | null }> = [];
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml))) {
    if (match[0].toLowerCase().startsWith("</node")) { stack.pop(); continue; }
    const text = decodeXml(match[1] ?? "").trim();
    if (!text) continue;
    const parentPath = stack.length ? stack.join(" › ") : null;
    stack.push(text);
    rows.push({ sourceFile, mapName, nodeText: text, path: stack.join(" › "), depth: stack.length - 1, parentPath });
    if (/\/\s*>$/.test(match[0])) stack.pop();
  }
  return rows;
}

export class SimerMapService {
  async summary() {
    const [stats, maps] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint; maps: bigint; importedAt: Date | null }>>`
        SELECT COUNT(*)::bigint total, COUNT(DISTINCT "mapName")::bigint maps, MAX("importedAt") "importedAt" FROM "SimerMapNode"
      `,
      prisma.$queryRaw<Array<{ mapName: string; total: bigint }>>`
        SELECT "mapName", COUNT(*)::bigint total FROM "SimerMapNode" GROUP BY "mapName" ORDER BY total DESC, "mapName" ASC LIMIT 30
      `,
    ]);
    return { total: Number(stats[0]?.total ?? 0), maps: Number(stats[0]?.maps ?? 0), importedAt: stats[0]?.importedAt ?? null, builderApiUrl: process.env.SIMER_BUILDER_API_URL?.trim() || "http://appdev.siagri.com.br:8888", items: maps.map(x => ({ mapName: x.mapName, total: Number(x.total) })) };
  }

  async search(query: string, limit = 50) {
    const q = query.trim();
    if (!q) return [];
    const safeLimit = Math.max(1, Math.min(limit, 100));
    return prisma.$queryRawUnsafe<MapRow[]>(`
      SELECT id, "sourceFile", "mapName", "nodeText", path, depth, "parentPath", "importedAt"
      FROM "SimerMapNode"
      WHERE "nodeText" ILIKE $1 OR path ILIKE $1 OR "mapName" ILIKE $1
      ORDER BY CASE WHEN "nodeText" ILIKE $2 THEN 0 WHEN "nodeText" ILIKE $1 THEN 1 ELSE 2 END, depth ASC, "mapName" ASC
      LIMIT $3
    `, `%${q}%`, q, safeLimit);
  }

  async importMap(sourceFile: string, content: string) {
    if (!/\.mm$/i.test(sourceFile)) throw new Error("Envie um arquivo de mapa .mm extraído do pacote.");
    if (!content.includes("<map") || !content.includes("<node")) throw new Error("Conteúdo de mapa inválido.");
    const rows = parseMap(content, sourceFile);
    if (!rows.length) throw new Error("Nenhum nó foi identificado no mapa.");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "SimerMapNode" WHERE "sourceFile" = $1`, sourceFile);
      for (let i = 0; i < rows.length; i += 250) {
        const chunk = rows.slice(i, i + 250);
        const values: unknown[] = [];
        const placeholders = chunk.map((row, idx) => {
          const base = idx * 6;
          values.push(row.sourceFile, row.mapName, row.nodeText, row.path, row.depth, row.parentPath);
          return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},CURRENT_TIMESTAMP)`;
        }).join(",");
        await tx.$executeRawUnsafe(`INSERT INTO "SimerMapNode" ("sourceFile","mapName","nodeText",path,depth,"parentPath","importedAt") VALUES ${placeholders}`, ...values);
      }
    });
    return { sourceFile, mapName: rows[0].mapName, total: rows.length };
  }
}
