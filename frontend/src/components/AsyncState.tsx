import type { ReactNode } from "react";
import { ContentState } from "./ContentState";

type AsyncStatus = "loading" | "empty" | "error" | "success";

type AsyncStateProps<T> = {
  status: AsyncStatus;
  data: T | null | undefined;
  error?: string | null;
  onRetry?: () => void;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  loading?: ReactNode;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
};

/** Apresentação assíncrona sem requisições internas: o consumidor mantém a lógica de dados. */
export function AsyncState<T>({ status, data, error, onRetry, onEmptyAction, emptyActionLabel, loading, empty, children }: AsyncStateProps<T>) {
  if (status === "loading") return <>{loading ?? <ContentState kind="loading" />}</>;
  if (status === "error") return <ContentState kind="error" description="Verifique a conexão e tente novamente." errorDetail={error ?? undefined} onRetry={onRetry} />;
  if (status === "empty" || data == null) return <>{empty ?? <ContentState kind="empty" onEmptyAction={onEmptyAction} emptyActionLabel={emptyActionLabel} />}</>;
  return <>{children(data)}</>;
}
