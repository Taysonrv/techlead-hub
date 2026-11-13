/** Pure SSE frame decoder. Handles split TCP chunks, CRLF and multiple frames per chunk. */
export type SseFrame = { id: string | null; data: string };
export function consumeSseFrames(buffer: string, chunk: string): { frames: SseFrame[]; remainder: string } {
  const normalized = (buffer + chunk).replace(/\r\n/g, "\n").replace(/\r(?=.)/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const frames = blocks.flatMap((block) => {
    const lines = block.split("\n");
    let id: string | null = null;
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const key = separator < 0 ? line : line.slice(0, separator);
      let value = separator < 0 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (key === "id" && !value.includes("\0")) id = value;
      if (key === "data") data.push(value);
    }
    return data.length ? [{ id, data: data.join("\n") }] : [];
  });
  return { frames, remainder };
}
