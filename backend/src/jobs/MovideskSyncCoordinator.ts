let owner: string | null = null;

export function tryAcquireMovideskApi(ownerName: string) {
  if (owner) return false;
  owner = ownerName;
  return true;
}

export function releaseMovideskApi(ownerName: string) {
  if (owner === ownerName) owner = null;
}

export function movideskApiOwner() {
  return owner;
}
