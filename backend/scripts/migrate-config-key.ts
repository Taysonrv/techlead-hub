import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Executar somente em janela de manutencao, com backup do PostgreSQL.
// Nunca imprime segredos ou valores de configuracao.
const prisma = new PrismaClient();
const knownKeys = ["organization", "project", "wiki", "pat", "movideskToken", "movideskUrl"];
const apply = process.argv.includes("--apply");
const jwt = process.env.JWT_SECRET?.trim() ?? "";
const dedicated = process.env.SYSTEM_CONFIG_KEY?.trim() ?? "";

function key(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function decrypt(serialized: string, secret: string): string {
  const [version, iv, tag, payload] = serialized.split(":");
  if (version !== "v1" || !iv || !tag || !payload) throw Error("Formato criptografico inesperado");
  const cipher = crypto.createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([cipher.update(Buffer.from(payload, "base64")), cipher.final()]).toString("utf8");
}

function encrypt(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), payload.toString("base64")].join(":");
}

async function main() {
  if (jwt.length < 32 || dedicated.length < 32) throw Error("JWT_SECRET original e SYSTEM_CONFIG_KEY de destino precisam estar presentes (minimo 32 caracteres).");
  if (jwt === dedicated) throw Error("Chaves de origem e destino devem ser distintas.");
  if (apply && process.env.CONFIG_MIGRATION_BACKUP_CONFIRMED !== "YES") {
    throw Error("Aplicacao bloqueada: execute pg_dump e defina CONFIG_MIGRATION_BACKUP_CONFIRMED=YES somente apos verificar o backup.");
  }

  const rows = await prisma.$queryRaw<Array<{ key: string; value: string; encrypted: boolean }>>`
    SELECT "key", "value", "encrypted" FROM "SystemSetting" ORDER BY "key"
  `;
  const recognized = rows.filter(row => knownKeys.includes(row.key));
  // Metadados operacionais não são credenciais e não devem ser recriptografados.
  // Qualquer novo tipo fora dessa lista interrompe a migração real.
  const operational = rows.filter(row =>
    !knownKeys.includes(row.key) &&
    row.encrypted === false &&
    (/^correction-monthly-close:[a-f0-9]+:\d{4}-\d{2}$/.test(row.key) ||
     /^movidesk-metadata-v2:[a-f0-9]+$/.test(row.key))
  );
  const unknown = rows.filter(row => !knownKeys.includes(row.key) && !operational.includes(row));
  if (operational.length) {
    console.log(`Registros operacionais preservados: ${operational.length} (sem alteração).`);
  }
  if (unknown.length) {
    console.warn(`Existem ${unknown.length} registro(s) inesperado(s) fora do escopo.`);
    if (apply) throw Error("Migracao bloqueada: revise os registros inesperados antes de executar --apply.");
  }
  if (recognized.some(row => row.encrypted !== true)) {
    throw Error("Uma configuração de integração não está marcada como criptografada. Migração interrompida.");
  }
  if (!recognized.length) throw Error("Nenhuma configuracao persistida encontrada; migracao cancelada.");

  const entries: Array<{ name: string; original: string; updated: string }> = [];
  let alreadyDedicated = 0;
  for (const row of recognized) {
    let plaintext: string;
    try {
      plaintext = decrypt(row.value, dedicated);
      alreadyDedicated += 1;
    } catch {
      try {
        plaintext = decrypt(row.value, jwt);
      } catch {
        throw Error(`Configuracao ${row.key} incompativel com as duas chaves; nenhuma alteracao efetuada.`);
      }
    }
    entries.push({ name: row.key, original: row.value, updated: encrypt(plaintext, dedicated) });
  }
  console.log(`Verificacao aprovada: ${entries.length} registro(s), ${alreadyDedicated} ja legivel(is) pela chave dedicada.`);
  if (!apply) {
    console.log("Simulacao concluida. Nada foi modificado. Para aplicar, faca backup e execute novamente com --apply.");
    return;
  }

  // Compare-and-swap evita migracao sobre registros alterados apos a leitura.
  await prisma.$transaction(async tx => {
    for (const row of entries) {
      const updated = await tx.$executeRaw`
        UPDATE "SystemSetting" SET "value" = ${row.updated}, "encrypted" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "key" = ${row.name} AND "value" = ${row.original}
      `;
      if (updated !== 1) throw Error("Atualizacao concorrente detectada. Transacao revertida.");
    }
  }, { timeout: 30_000 });
  console.log(`Migracao atomica concluida: ${entries.length} registro(s). Reinicie e teste todas as instancias antes de remover a chave antiga.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Falha na migracao; nenhuma credencial sera exibida.");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
