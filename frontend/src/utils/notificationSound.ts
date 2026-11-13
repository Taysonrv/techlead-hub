export type LocalNotificationPreferences = {
  sound: boolean;
  chat: boolean;
  operation: boolean;
  appVersion: boolean;
  simerVersion: boolean;
  azureCompleted: boolean;
  azureUpdated: boolean;
};

const KEY = "techlead-hub:notification-preferences";
const DESKTOP_ALERTS_KEY_PREFIX = "techlead-hub:desktop-alerts:";
export const DEFAULT_LOCAL_NOTIFICATION_PREFERENCES: LocalNotificationPreferences = {
  sound: true, chat: true, operation: true, appVersion: true, simerVersion: true, azureCompleted: true, azureUpdated: true,
};

export function getLocalNotificationPreferences(): LocalNotificationPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...DEFAULT_LOCAL_NOTIFICATION_PREFERENCES };
    const values = stored as Record<string, unknown>;
    return Object.fromEntries(Object.entries(DEFAULT_LOCAL_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [key, typeof values[key] === "boolean" ? values[key] : fallback])) as LocalNotificationPreferences;
  }
  catch { return DEFAULT_LOCAL_NOTIFICATION_PREFERENCES; }
}

export function saveLocalNotificationPreferences(value: LocalNotificationPreferences) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* armazenamento local opcional */ }
  window.dispatchEvent(new CustomEvent("techlead-hub:notification-preferences", { detail: value }));
}

export function getDesktopAlertsEnabled(userId: number | null | undefined): boolean {
  if (!userId) return false;
  try {
    const stored = localStorage.getItem(`${DESKTOP_ALERTS_KEY_PREFIX}${userId}`);
    return stored === null ? true : stored === "true";
  } catch { return true; }
}

export function saveDesktopAlertsEnabled(userId: number | null | undefined, enabled: boolean) {
  if (!userId) return;
  try { localStorage.setItem(`${DESKTOP_ALERTS_KEY_PREFIX}${userId}`, String(enabled)); } catch { /* armazenamento local opcional */ }
  window.dispatchEvent(new CustomEvent("techlead-hub:desktop-alert-preference", { detail: { userId, enabled } }));
}

export type ChatSoundEffect = "chat" | "system" | "sent" | "online" | "mention" | "nudge" | "sticker";

export function playNotificationSound(kind: ChatSoundEffect = "system") {
  if (!getLocalNotificationPreferences().sound) return;
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextCtor();
    const presets: Record<ChatSoundEffect, Array<[number, number, number]>> = {
      chat: [[720, .00, .10], [940, .10, .10]],
      system: [[620, .00, .10], [780, .10, .10]],
      sent: [[560, .00, .06], [760, .06, .08]],
      online: [[520, .00, .08], [660, .08, .08], [880, .16, .10]],
      mention: [[760, .00, .08], [1040, .09, .12]],
      nudge: [[180, .00, .06], [260, .07, .06], [180, .14, .06], [360, .21, .10]],
      sticker: [[440, .00, .07], [660, .07, .07], [880, .14, .13]],
    };
    const notes = presets[kind];
    const master = context.createGain();
    master.gain.setValueAtTime(.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(kind === "nudge" ? .09 : .055, context.currentTime + .012);
    master.gain.exponentialRampToValueAtTime(.0001, context.currentTime + Math.max(...notes.map(([, start, duration]) => start + duration)) + .06);
    master.connect(context.destination);
    notes.forEach(([frequency, start, duration], index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
      gain.gain.setValueAtTime(.0001, context.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(1, context.currentTime + start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + start + duration);
      oscillator.connect(gain); gain.connect(master);
      oscillator.start(context.currentTime + start); oscillator.stop(context.currentTime + start + duration + .01);
    });
    window.setTimeout(() => void context.close(), 650);
  } catch { /* áudio pode ser bloqueado pelo navegador antes da primeira interação */ }
}
