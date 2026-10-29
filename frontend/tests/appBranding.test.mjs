import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("browser metadata consistently names HUB SUPORTE SIMER", () => {
  const html = read("../index.html");
  assert.match(html, /<title>HUB SUPORTE SIMER<\/title>/);
  assert.match(html, /href="\/hub-suporte-simer\.svg"/);
  assert.match(html, /href="\/manifest\.webmanifest"/);
});

test("app manifest and vector icon use approved dark-green branding", () => {
  const manifest = JSON.parse(read("../public/manifest.webmanifest"));
  const icon = read("../public/hub-suporte-simer.svg");
  assert.equal(manifest.name, "HUB SUPORTE SIMER");
  assert.equal(manifest.theme_color, "#071d2b");
  assert.equal(manifest.icons[0].src, "/hub-suporte-simer.svg");
  assert.match(icon, /viewBox="0 0 128 128"/);
  assert.match(icon, /#20c995/i);
});

test("sidebar login About and page titles use the same application name", () => {
  for (const path of ["../src/components/Sidebar.tsx", "../src/pages/Login.tsx", "../src/pages/About.tsx", "../src/App.tsx"]) {
    assert.match(read(path), /HUB SUPORTE SIMER/, path);
  }
  assert.doesNotMatch(read("../src/pages/Login.tsx"), /TechLead Hub · SIMER/);
});
