import { useEffect, useState } from "react";
import { api } from "../../../services/api";

export type Availability = "ONLINE" | "AWAY" | "BUSY";

function initialAvailability(): Availability {
  const stored = localStorage.getItem("techlead-chat-status");
  return stored === "AWAY" || stored === "BUSY" ? stored : "ONLINE";
}

/** Presence is refreshed every 25s and on visibility changes, with user preference persisted locally. */
export function useChatPresence(onError: (message: string) => void) {
  const [availability, setAvailability] = useState<Availability>(initialAvailability);
  const [statusMessage] = useState(() => localStorage.getItem("techlead-chat-status-message") || "");

  useEffect(() => {
    const send = () => {
      const status = document.visibilityState === "hidden" ? "AWAY" : availability;
      void api.post("/chat/presence", { status, statusMessage }).catch(() => undefined);
    };
    send();
    const timer = window.setInterval(send, 25_000);
    document.addEventListener("visibilitychange", send);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", send); };
  }, [availability, statusMessage]);

  const cycleAvailability = () => {
    const next: Availability = availability === "ONLINE" ? "AWAY" : availability === "AWAY" ? "BUSY" : "ONLINE";
    setAvailability(next);
    localStorage.setItem("techlead-chat-status", next);
    void api.post("/chat/presence", { status: next, statusMessage }).catch(() => onError("Não foi possível atualizar o status de presença."));
  };

  return { availability, statusMessage, cycleAvailability };
}
