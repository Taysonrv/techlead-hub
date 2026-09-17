import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([".git", ".agents", ".claude", ".windsurf", "node_modules", "dist", "release", "coverage"]);
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".md", ".sql", ".ps1"]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["Azure DevOps PAT", /\b[A-Za-z0-9]{52}\b/],
  ["hard-coded secret", /\b(?:JWT_SECRET|SYSTEM_CONFIG_KEY|CLIENT_SECRET|DATABASE_URL)\s*[:=]\s*["'][^"']{12,}["']/i],
];

const findings = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name !== "security-check.mjs" && allowedExtensions.has(path.extname(entry.name)) && !entry.name.endsWith("package-lock.json")) {
      const content = fs.readFileSync(file, "utf8");
      patterns.forEach(([label, pattern]) => { if (pattern.test(content)) findings.push(`${path.relative(root, file)}: possível ${label}`); });
    }
  }
}
visit(root);
if (findings.length) {
  console.error("Possíveis segredos encontrados:\n" + findings.join("\n"));
  process.exit(1);
}
console.log("Varredura local de segredos concluída sem ocorrências.");
