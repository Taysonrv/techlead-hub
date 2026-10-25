import { useMemo } from "react";
import type { Channel } from "../chatTypes";

/** Keep the selected legacy direct conversation visible while collapsing duplicate DMs. */
export function normalizeChatChannels(rawChannels: Channel[], userId: number | undefined, activeId: number | null) {
  const directByPeer = new Map<number, Channel>();
  const nonDirect: Channel[] = [];
  const peerId = (channel: Channel) => channel.members?.map((member) => member.user.id).find((id) => id !== userId);
  for (const channel of rawChannels) {
    if (channel.type !== "DIRECT") { nonDirect.push(channel); continue; }
    const peer = peerId(channel);
    if (!peer) { nonDirect.push(channel); continue; }
    const existing = directByPeer.get(peer);
    if (!existing) { directByPeer.set(peer, channel); continue; }
    const existingLatest = existing.messages?.[existing.messages.length - 1]?.id ?? 0;
    const currentLatest = channel.messages?.[channel.messages.length - 1]?.id ?? 0;
    if (currentLatest > existingLatest || (currentLatest === existingLatest && channel.unread > existing.unread)) directByPeer.set(peer, channel);
  }
  let channels = [...directByPeer.values(), ...nonDirect];
  const active = activeId ? rawChannels.find((channel) => channel.id === activeId) : undefined;
  if (active && !channels.some((channel) => channel.id === active.id)) {
    if (active.type === "DIRECT") {
      const peer = peerId(active);
      if (peer) channels = channels.filter((channel) => channel.type !== "DIRECT" || peerId(channel) !== peer);
    }
    channels.unshift(active);
  }
  return { channels, directByPeer };
}

type Options = {
  channels: Channel[];
  selectedId: number | null;
  conversationSearch: string;
  favorites: number[];
};

export function useChannelDirectory({ channels, selectedId, conversationSearch, favorites }: Options) {
  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);
  const visibleChannels = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return channels;
    return channels.filter((channel) => {
      const peerNames = channel.members?.map((member) => member.user.name).join(" ") ?? "";
      return [channel.name, channel.description, channel.clientName, peerNames]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [channels, conversationSearch]);
  const sortedVisibleChannels = useMemo(() => visibleChannels.slice().sort((a, b) => {
    const group = (channel: Channel) => favorites.includes(channel.id) ? 0 : channel.type === "DIRECT" ? 1 : 2;
    return group(a) - group(b) || b.unread - a.unread ||
      ((b.messages?.[b.messages.length - 1]?.id ?? 0) - (a.messages?.[a.messages.length - 1]?.id ?? 0));
  }), [visibleChannels, favorites]);
  const sidebarChannels = useMemo(() => {
    if (!selected || sortedVisibleChannels.some((channel) => channel.id === selected.id)) return sortedVisibleChannels;
    return [selected, ...sortedVisibleChannels];
  }, [selected, sortedVisibleChannels]);
  const totalUnread = useMemo(() => channels.reduce((sum, channel) => sum + channel.unread, 0), [channels]);
  return { selected, sidebarChannels, totalUnread };
}
