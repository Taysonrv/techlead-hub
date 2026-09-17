export type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets?: Array<{ name: string }>;
};

export type BetaRelease = {
  version: string;
  tag: string;
  feedUrl: string;
};

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = value.trim().replace(/^v/i, "").match(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/,
    );
    if (!match) return null;
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4]?.split(".") ?? [],
    };
  };

  const leftVersion = parse(left);
  const rightVersion = parse(right);
  if (!leftVersion || !rightVersion) {
    return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
  }

  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) return difference;
  }

  if (!leftVersion.prerelease.length && rightVersion.prerelease.length) return 1;
  if (leftVersion.prerelease.length && !rightVersion.prerelease.length) return -1;

  for (
    let index = 0;
    index < Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
    index += 1
  ) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart.localeCompare(rightPart, "en", { sensitivity: "base" });
  }

  return 0;
}

export function selectLatestBetaRelease(
  releases: GithubRelease[],
  owner: string,
  repo: string,
): BetaRelease | null {
  const candidates = releases
    .filter((release) => {
      if (release.draft || !release.prerelease) return false;
      if (!/^v?\d+\.\d+\.\d+-rc\.\d+$/i.test(release.tag_name)) return false;
      return release.assets?.some((asset) => asset.name === "beta.yml") ?? false;
    })
    .sort((left, right) => compareVersions(right.tag_name, left.tag_name));

  const latest = candidates[0];
  if (!latest) return null;

  const tag = latest.tag_name;
  return {
    tag,
    version: tag.replace(/^v/i, ""),
    feedUrl: `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}`,
  };
}

export async function discoverLatestBetaRelease(
  owner: string,
  repo: string,
  request: typeof fetch = fetch,
): Promise<BetaRelease | null> {
  const response = await request(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TechLead-Hub-Updater",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub releases respondeu HTTP ${response.status}.`);
  }

  const releases = (await response.json()) as GithubRelease[];
  return selectLatestBetaRelease(releases, owner, repo);
}
