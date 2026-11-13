import "dotenv/config";
import { prisma } from "../src/database/prisma";
import { MovideskService } from "../src/services/MovideskService";

async function main() {
  const service = new MovideskService();
  const result = await service.testConnection();
  console.log(JSON.stringify({ ok: result.ok, authentication: result.authentication, sampleCount: result.sampleCount }, null, 2));
}

void main().catch(error => {
  console.error("[movidesk-auth-check]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
