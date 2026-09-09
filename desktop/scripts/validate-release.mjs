import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const release = resolve("release");
if (!existsSync(release)) throw new Error("Pasta release não encontrada.");

const files = readdirSync(release);
const installer = files.find((name) => name.endsWith(".exe"));
const blockmap = installer && `${installer}.blockmap`;
const metadata = files.find((name) => name === "beta.yml" || name === "latest.yml");

if (!installer || !blockmap || !files.includes(blockmap) || !metadata) {
  throw new Error("Release incompleta: instalador, blockmap ou metadados ausentes.");
}

const minimumSize = 50 * 1024 * 1024;
if (statSync(resolve(release, installer)).size < minimumSize) {
  throw new Error("O instalador gerado possui tamanho inesperadamente pequeno.");
}

console.log(`Release validada: ${installer}, ${blockmap}, ${metadata}`);
