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
export const DEFAULT_LOCAL_NOTIFICATION_PREFERENCES: LocalNotificationPreferences = {
  sound: true, chat: true, operation: true, appVersion: true, simerVersion: true, azureCompleted: true, azureUpdated: true,
};

export function getLocalNotificationPreferences(): LocalNotificationPreferences {
  try { return { ...DEFAULT_LOCAL_NOTIFICATION_PREFERENCES, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return DEFAULT_LOCAL_NOTIFICATION_PREFERENCES; }
}

export function saveLocalNotificationPreferences(value: LocalNotificationPreferences) {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("techlead-hub:notification-preferences", { detail: value }));
}

export function playNotificationSound(kind: "chat" | "system" = "system") {
  if (!getLocalNotificationPreferences().sound) return;
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(kind === "chat" ? 720 : 620, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "chat" ? 940 : 780, context.currentTime + .11);
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.07, context.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .18);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .2);
    oscillator.onended = () => void context.close();
  } catch { /* áudio pode ser bloqueado pelo navegador antes da primeira interação */ }
}
