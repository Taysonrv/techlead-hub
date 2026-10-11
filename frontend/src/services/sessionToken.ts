/** Used only to decide cache invalidation; the backend validates the token. */
export function isSameSession(previousToken: string | null, token: string): boolean {
  if (!previousToken) return false;
  try {
    const claims = (value: string): { sub?: string; sid?: string; role?: string } =>
      JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const previous = claims(previousToken);
    const next = claims(token);
    return typeof previous.sub === "string" && Boolean(previous.sub) &&
      typeof previous.sid === "string" && Boolean(previous.sid) &&
      typeof previous.role === "string" && Boolean(previous.role) &&
      previous.sub === next.sub && previous.sid === next.sid && previous.role === next.role;
  } catch {
    return false;
  }
}
