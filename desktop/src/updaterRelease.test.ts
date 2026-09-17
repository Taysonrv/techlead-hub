import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, selectLatestBetaRelease } from "./updaterRelease";

test("ordena release candidates numericamente", () => {
  assert.equal(compareVersions("1.0.0-rc.10", "1.0.0-rc.9"), 1);
  assert.equal(compareVersions("1.0.0-rc.6", "1.0.0-rc.5"), 1);
});

test("seleciona a RC mais recente somente com beta.yml", () => {
  const release = selectLatestBetaRelease(
    [
      { tag_name: "v1.0.0-rc.6", draft: false, prerelease: true, assets: [{ name: "beta.yml" }] },
      { tag_name: "v1.0.0-rc.10", draft: false, prerelease: true, assets: [{ name: "beta.yml" }] },
      { tag_name: "v1.0.0-rc.11", draft: true, prerelease: true, assets: [{ name: "beta.yml" }] },
      { tag_name: "v1.0.0-rc.12", draft: false, prerelease: true, assets: [] },
    ],
    "Taysonrv",
    "techlead-hub-releases",
  );

  assert.equal(release?.version, "1.0.0-rc.10");
  assert.match(release?.feedUrl ?? "", /v1\.0\.0-rc\.10$/);
});
