type NotificationItem = { key: string; kind: string; occurredAt: string };

/** Preserve independently loaded reminders and desktop updates across a server refresh. */
export function mergeNotificationItems<T extends NotificationItem>(current: T[], incoming: T[]): T[] {
  const retained=current.filter(item=>item.kind==="APP_VERSION"||item.kind==="MEETING_REMINDER");
  return [...new Map([...retained,...incoming].map(item=>[item.key,item])).values()]
    .sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
}
