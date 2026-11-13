import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const release = resolve("release");
if (!existsSync(release)) throw new Error("Pasta release não encontrada.");

const files = readdirSync(release);
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const expectedVersion = packageJson.version;
const installer = `TechLead-Hub-Setup-${expectedVersion}.exe`;
const blockmap = `${installer}.blockmap`;
const metadata = files.find((name) => name === "beta.yml" || name === "latest.yml");

const metadataText = metadata ? readFileSync(resolve(release, metadata), "utf8") : "";
const metadataVersion = metadataText.match(/^version:\s*(.+)\s*$/m)?.[1];
const metadataInstaller = metadataText.match(/^\s*-?\s*url:\s*(.+)\s*$/m)?.[1];
if (!files.includes(installer) || !files.includes(blockmap) || !metadata) {
  const existingInstallers = files.filter((name) => name.endsWith(".exe"));
  if (existingInstallers.length || metadataVersion || metadataInstaller) {
    throw new Error(
      `Artefatos ausentes ou desatualizados: esperado ${installer} e metadados da versão ${expectedVersion}; encontrados: ${existingInstallers.join(", ") || "nenhum instalador"}, ${metadata ?? "sem metadados"}. Gere novamente o pacote antes de validar.`,
    );
  }
  throw new Error("Release incompleta: instalador, blockmap ou metadados ausentes.");
}

if (metadataVersion !== expectedVersion || metadataInstaller !== installer) {
  throw new Error(
    `Artefatos desatualizados: package.json=${expectedVersion}, ${metadata}=${metadataVersion ?? "sem versão"}, instalador=${metadataInstaller ?? "ausente"}. Gere novamente o pacote antes de validar.`,
  );
}

const minimumSize = 50 * 1024 * 1024;
if (statSync(resolve(release, installer)).size < minimumSize) {
  throw new Error("O instalador gerado possui tamanho inesperadamente pequeno.");
}

console.log(`Release validada: ${installer}, ${blockmap}, ${metadata}`);
