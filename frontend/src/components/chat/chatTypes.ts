export type Person = { id: number; name: string; username: string; role: string };
export type Message = { id: number; content: string; createdAt: string; parentId?: number | null; author: Person };
export type Channel = { id: number; name: string; type: string; contextType?: string | null; contextId?: string | null; description?: string | null; clientName?: string | null; unread: number; messages: Message[]; members?: Array<{ user: Person }> };
export type Presence = { userId: number; status: string; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE"; statusMessage?: string | null; lastSeenAt: string; name: string; username: string };
export type RealtimeSnapshot = { presence: Presence[]; typing: Array<{ channelId: number; userId: number; name: string }>; latestMessage: { id: number; channelId: number; authorId: number } | null };

export function presenceColor(status: Presence["effectiveStatus"] | undefined) {
  if (status === "ONLINE") return "success.main";
  if (status === "AWAY") return "warning.main";
  if (status === "BUSY") return "error.main";
  return "text.disabled";
}
