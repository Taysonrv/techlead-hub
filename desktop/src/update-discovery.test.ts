import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAppVersions,
  findNewestRelease,
} from "./update-discovery.js";

test("ordena versões RC numericamente", () => {
  assert.equal(compareAppVersions("1.0.0-rc.6", "1.0.0-rc.5"), 1);
  assert.equal(compareAppVersions("1.0.0-rc.10", "1.0.0-rc.9"), 1);
  assert.equal(compareAppVersions("1.0.0", "1.0.0-rc.10"), 1);
});

test("seleciona a prerelease mais recente que possui beta.yml", () => {
  const release = findNewestRelease([
    { tag_name: "v1.0.0-rc.5", draft: false, prerelease: true, assets: [{ name: "beta.yml" }] },
    { tag_name: "v1.0.0-rc.8", draft: true, prerelease: true, assets: [{ name: "beta.yml" }] },
    { tag_name: "v1.0.0-rc.7", draft: false, prerelease: true, assets: [{ name: "installer.exe" }] },
    { tag_name: "v1.0.0-rc.6", draft: false, prerelease: true, assets: [{ name: "beta.yml" }] },
  ], true, "beta.yml");

  assert.equal(release?.tag_name, "v1.0.0-rc.6");
});
