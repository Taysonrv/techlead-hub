import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "../../../services/api";

type Options = {
  selectedId: number | null;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  refreshMessages: (channelId: number) => Promise<unknown>;
  setError: (message: string) => void;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** An upload always targets the channel where it started, even if navigation occurs while reading. */
export function useChatAttachment({ selectedId, attachmentInputRef, refreshMessages, setError }: Options) {
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const activeChannelRef = useRef(selectedId);
  activeChannelRef.current = selectedId;
  const inFlight = useRef(false);

  const sendAttachment = useCallback(async (file: File) => {
    const targetChannel = activeChannelRef.current;
    if (!targetChannel || inFlight.current) return false;
    if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
      setError("O anexo deve ter entre 1 byte e 8 MB.");
      return false;
    }
    inFlight.current = true;
    setUploadingAttachment(true);
    if (activeChannelRef.current === targetChannel) setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(file);
      });
      await api.post(`/chat/channels/${targetChannel}/attachments`, {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data,
      });
      if (activeChannelRef.current === targetChannel) await refreshMessages(targetChannel);
      return true;
    } catch (error: unknown) {
      if (activeChannelRef.current === targetChannel) {
        const failure = error as { response?: { data?: { error?: string } } };
        setError(failure.response?.data?.error || "Não foi possível enviar o anexo.");
      }
      return false;
    } finally {
      inFlight.current = false;
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }, [attachmentInputRef, refreshMessages, setError]);

  return { sendAttachment, uploadingAttachment };
}
