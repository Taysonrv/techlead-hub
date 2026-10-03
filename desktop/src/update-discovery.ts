export type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
  }>;
};

export function compareAppVersions(left: string, right: string): number {
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

export function findNewestRelease(
  releases: GitHubRelease[],
  prerelease: boolean,
  manifestName: string,
): GitHubRelease | null {
  return releases
    .filter((release) => (
      !release.draft &&
      release.prerelease === prerelease &&
      release.assets.some((asset) => asset.name === manifestName)
    ))
    .sort((left, right) => compareAppVersions(right.tag_name, left.tag_name))[0] ?? null;
}

/**
 * Descobre a melhor atualização para a instalação atual.
 *
 * Builds estáveis permanecem estritamente no canal latest.
 * Builds prerelease podem continuar no beta ou promover para uma versão
 * estável superior. Isso permite a transição RC -> primeira LTS sem deixar
 * instalações existentes presas permanentemente no canal beta.
 */
export function findBestUpdateRelease(
  releases: GitHubRelease[],
  currentVersion: string,
): { release: GitHubRelease; manifestName: "beta.yml" | "latest.yml"; channel: "beta" | "latest" } | null {
  const currentIsPrerelease = currentVersion.includes("-");

  const candidates = releases.flatMap((release) => {
    if (release.draft) return [];

    if (!release.prerelease && release.assets.some((asset) => asset.name === "latest.yml")) {
      return [{ release, manifestName: "latest.yml" as const, channel: "latest" as const }];
    }

    if (
      currentIsPrerelease &&
      release.prerelease &&
      release.assets.some((asset) => asset.name === "beta.yml")
    ) {
      return [{ release, manifestName: "beta.yml" as const, channel: "beta" as const }];
    }

    return [];
  });

  return candidates
    .filter(({ release }) => compareAppVersions(release.tag_name, currentVersion) > 0)
    .sort((left, right) => compareAppVersions(right.release.tag_name, left.release.tag_name))[0] ?? null;
}
