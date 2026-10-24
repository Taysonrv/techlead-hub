/** Validação preliminar do upload; não substitui o parser de JSON/Excel. */
export type ImportFileFormat = "json" | "xlsx";

export function validateImportFile(file: { originalname: string; buffer: Buffer }): ImportFileFormat {
  const name = file.originalname.toLowerCase();
  const format: ImportFileFormat | null = name.endsWith(".json") ? "json" : name.endsWith(".xlsx") ? "xlsx" : null;
  if (!format) throw new Error("Formato inválido. Envie um arquivo .xlsx ou .json do Movidesk.");
  if (!file.buffer.length) throw new Error("O arquivo enviado está vazio.");
  if (format === "xlsx") {
    // Arquivos XLSX válidos são contêineres ZIP; não confiar apenas na extensão.
    const zip = file.buffer.length >= 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04;
    if (!zip) throw new Error("O arquivo Excel enviado não possui um formato .xlsx válido.");
  } else {
    const beginning = file.buffer.toString("utf8", 0, Math.min(file.buffer.length, 4096)).replace(/^\uFEFF/, "").trimStart();
    if (!beginning.startsWith("{") && !beginning.startsWith("[")) {
      throw new Error("O arquivo não contém um JSON válido.");
    }
  }
  return format;
}
