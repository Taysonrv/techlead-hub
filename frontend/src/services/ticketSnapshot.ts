import { api } from "./api";

const SNAPSHOT_TTL_MS = 30_000;

let cachedAt = 0;
let cachedTickets: unknown[] | null = null;
let inFlight: Promise<unknown[]> | null = null;

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
        return response.data as unknown[];
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight as Promise<T[]>;
}

export function invalidateTicketSnapshot() {
  cachedTickets = null;
  cachedAt = 0;
}
