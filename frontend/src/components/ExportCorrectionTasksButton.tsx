import type { ReactNode } from "react";
import { Box, Button, Tooltip } from "@mui/material";
import { DownloadOutlined } from "@mui/icons-material";

export type CorrectionExportRow = {
  id: number;
  title: string;
  client: string | null;
  createdBy: string | null;
  createdAt: string | null;
  status: string;
  lastStateChangedAt: string | null;
  urgency: string | null;
  prioritized: boolean | null;
  assignedTo: string | null;
  terminalAt: string | null;
  remoteUrl: string | null;
  stateAtOpen?: string | null;
  stateAtClose?: string | null;
  registeredInPeriod: boolean;
  deliveredInPeriod: boolean;
  canceledInPeriod: boolean;
  enteredRegistrationInPeriod: boolean;
  backlogInitial: boolean;
  backlogCurrent: boolean;
};

type Props = {
  rows: CorrectionExportRow[];
  title: string;
  subtitle?: string;
  startIcon?: ReactNode;
  fullWidth?: boolean;
};

const headers = [
  "Task Azure","Título","Cliente","Criado por","Data de criação","Status no fechamento",
  "Status na abertura","Última mudança de status","Urgência","Priorizada","Responsável atual",
  "Conclusão/Cancelamento","Criada no período","Entregue no período","Cancelada no período",
  "Entrou em Registro no período","Backlog inicial","Backlog atual","URL Azure",
];

function excelDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function yesNo(value: boolean | null | undefined) {
  return value === null || value === undefined ? "" : value ? "Sim" : "Não";
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "correcoes_azure";
}

export function exportCorrectionTasksToExcel(rows: CorrectionExportRow[], title: string, subtitle?: string) {
  const values = rows.map((row) => [
    row.id,row.title,row.client,row.createdBy,excelDate(row.createdAt),row.status,row.stateAtOpen,
    excelDate(row.lastStateChangedAt),row.urgency,yesNo(row.prioritized),row.assignedTo,
    excelDate(row.terminalAt),yesNo(row.registeredInPeriod),yesNo(row.deliveredInPeriod),
    yesNo(row.canceledInPeriod),yesNo(row.enteredRegistrationInPeriod),yesNo(row.backlogInitial),
    yesNo(row.backlogCurrent),row.remoteUrl,
  ]);

  const tableRows = [
    `<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${xml(title)}</Data></Cell></Row>`,
    ...(subtitle ? [`<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${xml(subtitle)}</Data></Cell></Row>`] : []),
    `<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">Exportado em ${xml(new Date().toLocaleString("pt-BR"))} · ${rows.length} task(s)</Data></Cell></Row>`,
    `<Row>${headers.map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(header)}</Data></Cell>`).join("")}</Row>`,
    ...values.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join("")}</Row>`),
  ].join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDF6EE" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="Correções Azure"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;

  const blob = new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(title)}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportCorrectionTasksButton({ rows, title, subtitle, startIcon, fullWidth = false }: Props) {
  return (
    <Box sx={{ width: fullWidth ? "100%" : "auto", display: "flex", justifyContent: "flex-end" }}>
      <Tooltip title={rows.length ? `Exportar ${rows.length} task(s) com detalhamento para Excel` : "Nenhuma task para exportar"}>
        <span style={{ width: fullWidth ? "100%" : undefined }}>
          <Button
            fullWidth={fullWidth}
            size="small"
            variant="outlined"
            startIcon={startIcon ?? <DownloadOutlined />}
            disabled={!rows.length}
            onClick={() => exportCorrectionTasksToExcel(rows, title, subtitle)}
            sx={{ textTransform: "none", fontWeight: 800 }}
          >
            Exportar Excel
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
