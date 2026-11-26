import { useCallback, useEffect, useState } from "react";
import {
  getTicketSnapshot, getTicketSnapshotState, invalidateTicketSnapshot,
  subscribeTicketSnapshotRefresh,
} from "../services/ticketSnapshot";

/** Keep last successful data and its acquisition time distinct from refresh attempts. */
export function useTicketSnapshot<T>() {
  const [data, setData] = useState<T[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    invalidateTicketSnapshot();
    setRevision(value => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const load = async () => {
      const currentRequest = ++requestId;
      setLoading(true);
      try {
        const rows = await getTicketSnapshot<T>();
        if (!active || currentRequest !== requestId) return;
        const state = getTicketSnapshotState();
        setData(rows);
        setUpdatedAt(new Date(state.cachedAt));
        setError(state.lastErrorAt
          ? "A atualização falhou. Exibindo os últimos dados disponíveis."
          : null);
      } catch {
        if (active && currentRequest === requestId) {
          setError("Não foi possível atualizar os resultados. Verifique a conexão e tente novamente.");
        }
      } finally {
        if (active && currentRequest === requestId) {
          setCheckedAt(Date.now());
          setLoading(false);
        }
      }
    };
    void load();
    const unsubscribe = subscribeTicketSnapshotRefresh(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, [revision]);

  return { data, updatedAt, checkedAt, loading, error, refresh };
}
