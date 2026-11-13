export type Favorite = { id: string; label: string; path: string; kind: "card" | "routine" };
const key = (userId: number | string) => `techlead-hub.favorites.v1.${userId}`;
export const readFavorites = (userId: number | string): Favorite[] => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(userId)) || "[]");
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.path === "string" && (item.kind === "card" || item.kind === "routine")).slice(0, 100) : [];
  } catch { return []; }
};
export const toggleFavorite = (userId: number | string, favorite: Favorite) => {
  const current = readFavorites(userId);
  const next = current.some((item) => item.id === favorite.id) ? current.filter((item) => item.id !== favorite.id) : [...current, favorite];
  try { window.localStorage.setItem(key(userId), JSON.stringify(next)); window.dispatchEvent(new CustomEvent("techlead-favorites-changed")); } catch { /* storage optional */ }
  return next;
};
