import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../src");
const issues = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(filename);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) continue;

    const source = readFileSync(filename, "utf8");
    const displayPath = relative(root, filename).replaceAll("\\", "/");
    const checks = [
      [/<InputLabel\b[^>]*\bhtmlFor\s*=/g, "InputLabel de Select deve usar labelId, não htmlFor"],
      [/\beval\s*\(/g, "CSP: não utilizar eval"],
      [/\bnew\s+Function\s*\(/g, "CSP: não utilizar new Function"],
      [/\b(?:setTimeout|setInterval)\s*\(\s*["'`]/g, "CSP: não avaliar código em string"],
    ];

    for (const [pattern, description] of checks) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        issues.push(`${displayPath}:${line}: ${description}`);
      }
    }
  }
}

scan(root);
const period = readFileSync(join(root, "components/PeriodFilter.tsx"), "utf8");
if (!period.includes("useId()") || /id="period-(?:filter|start-date|end-date)"/.test(period)) {
  issues.push("components/PeriodFilter.tsx: os IDs do filtro devem ser únicos por instância (useId)");
}

if (issues.length) {
  console.error("Falha na verificação de segurança e acessibilidade:\n" + issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Acessibilidade/CSP: sem InputLabel htmlFor incorreto, IDs fixos no PeriodFilter ou eval direto.");
}
