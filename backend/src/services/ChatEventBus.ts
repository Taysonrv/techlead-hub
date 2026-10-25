/**
 * Transporte em memória para instância única. Interface simples para futura
 * substituição por Redis em implantação horizontal.
 * O payload não inclui conteúdo de mensagens: cada cliente consulta apenas
 * seu snapshot autorizado pelo ChatService.
 */
type Listener = () => void;
const listeners = new Map<number, Set<Listener>>();

export const chatEventBus = {
  subscribe(userId: number, listener: Listener): () => void {
    const group = listeners.get(userId) ?? new Set<Listener>();
    group.add(listener);
    listeners.set(userId, group);
    return () => {
      group.delete(listener);
      if (!group.size) listeners.delete(userId);
    };
  },
  publish(userIds: readonly number[]): void {
    for (const userId of new Set(userIds)) {
      for (const listener of listeners.get(userId) ?? []) {
        try { listener(); } catch { /* outro assinante não pode bloquear o fluxo */ }
      }
    }
  },
};
