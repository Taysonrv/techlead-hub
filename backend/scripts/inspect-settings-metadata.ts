import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Inventário de metadados: não consulta nem imprime valores das credenciais.
const prisma = new PrismaClient();
const integrationKeys = new Set(["organization", "project", "wiki", "pat", "movideskToken", "movideskUrl"]);

async function main() {
  const rows = await prisma.$queryRaw<Array<{ key: string; encrypted: boolean }>>`
    SELECT "key", "encrypted" FROM "SystemSetting" ORDER BY "key"
  `;
  console.log(`Total de registros: ${rows.length}. Integrações conhecidas: ${rows.filter(row => integrationKeys.has(row.key)).length}.`);
  for (const row of rows.filter(row => !integrationKeys.has(row.key))) {
    console.log(JSON.stringify({ key: row.key, encrypted: row.encrypted }));
  }
  console.log("Somente metadados consultados. Nenhum valor ou segredo foi lido ou alterado.");
}

main().catch(() => { console.error("Não foi possível consultar os metadados de SystemSetting."); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
