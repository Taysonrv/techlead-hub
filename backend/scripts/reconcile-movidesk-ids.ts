import { prisma } from "../src/database/prisma";
import { MovideskService } from "../src/services/MovideskService";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const rawIds = args.filter(arg => arg !== "--apply");
  if (!rawIds.length || rawIds.length > 20 || rawIds.some(value => !/^\\d+$/.test(value))) {
    throw new Error("Uso: npm run movidesk:reconcile-ids -- 816434 827712 834184 835645 [--apply]");
  }
  const ids = rawIds.map(Number);
  const result = await new MovideskService().reconcileTicketIds(ids, apply);
  console.log(JSON.stringify(result, null, 2));
  if (result.results.some(item => ["ERRO_IMPORTACAO", "NAO_RETORNADO_PELA_API"].includes(item.outcome))) {
    process.exitCode = 1;
  }
}

void main().catch(error => {
  console.error("[movidesk-reconcile-ids]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
