let owner: string | null = null;
let priorityRequested = false;

export function requestMovideskApiPriority() {
  priorityRequested = true;
}

export function clearMovideskApiPriority() {
  priorityRequested = false;
}

export function hasMovideskApiPriorityRequest() {
  return priorityRequested;
}

export function tryAcquireMovideskApi(ownerName: string) {
  if (owner) return false;
  if (priorityRequested && !["TICKETS", "MANUAL"].includes(ownerName)) return false;
  owner = ownerName;
  if (ownerName === "TICKETS") priorityRequested = false;
  return true;
}

export function releaseMovideskApi(ownerName: string) {
  if (owner === ownerName) owner = null;
}

export function movideskApiOwner() {
  return owner;
}
