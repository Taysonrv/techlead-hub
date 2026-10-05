import { api } from "./api";

const SNAPSHOT_TTL_MS = 30_000;
const SNAPSHOT_STALE_MS = 5 * 60_000;

let cachedAt = 0;
let cachedTickets: unknown[] | null = null;
let inFlight: Promise<unknown[]> | null = null;
let lastErrorAt = 0;

/**
 * Snapshot operacional compartilhado pelas telas analíticas.
 * Evita que Dashboard, Clientes e Tickets repitam a mesma consulta pesada
 * durante navegação rápida. O TTL curto mantém os dados operacionais atuais.
 */
export async function getTicketSnapshot<T>(): Promise<T[]> {
  const now = Date.now();
  if (cachedTickets && now - cachedAt < SNAPSHOT_TTL_MS) {
    return cachedTickets as T[];
  }

  if (!inFlight) {
    inFlight = api.get<T[]>("/dashboard/tickets", { timeout: 60_000 })
      .then((response) => {
        cachedTickets = response.data;
        cachedAt = Date.now();
        lastErrorAt = 0;
        return response.data as unknown[];
      })
      .catch((error) => {
        lastErrorAt = Date.now();
        if (cachedTickets && Date.now() - cachedAt < SNAPSHOT_STALE_MS) {
          return cachedTickets;
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight as Promise<T[]>;
}

export function getTicketSnapshotState() {
  return { cachedAt, lastErrorAt, stale: Boolean(cachedTickets && Date.now() - cachedAt >= SNAPSHOT_TTL_MS) };
}

export function invalidateTicketSnapshot() {
  cachedTickets = null;
  cachedAt = 0;
}
