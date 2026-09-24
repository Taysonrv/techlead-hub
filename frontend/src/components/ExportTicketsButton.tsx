import type { ReactNode } from "react";
import { Box, Button, Tooltip } from "@mui/material";
import { DownloadOutlined } from "@mui/icons-material";

export type TicketExportRow = {
  movideskId?: number | null;
  protocol?: string | null;
  subject?: string | null;
  client?: string | null;
  contact?: string | null;
  owner?: string | null;
  team?: string | null;
  category?: string | null;
  cause?: string | null;
  urgency?: string | null;
  status?: string | null;
  baseStatus?: string | null;
  service?: string | null;
  department?: string | null;
  createdDate?: string | null;
  dueDate?: string | null;
  resolvedDate?: string | null;
  closedDate?: string | null;
  taskNumber?: number | null;
  taskStatus?: string | null;
  deliveredVersion?: string | null;
};

type Props = {
  tickets: TicketExportRow[];
  title: string;
  subtitle?: string;
  startIcon?: ReactNode;
};

const headers = [
  "Ticket Movidesk", "Protocolo", "Assunto", "Cliente", "Contato", "Responsável",
  "Equipe", "Categoria", "Causa", "Urgência", "Status", "Status Base", "Serviço",
  "Departamento", "Data Abertura", "Vencimento", "Resolvido em", "Encerrado em",
  "Task Azure", "Status Task", "Versão Entregue",
];

function excelDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
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
    .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "atendimentos";
}

export function exportTicketsToExcel(tickets: TicketExportRow[], title: string, subtitle?: string) {
  const rows = tickets.map((ticket) => [
    ticket.movideskId, ticket.protocol, ticket.subject, ticket.client, ticket.contact,
    ticket.owner, ticket.team, ticket.category, ticket.cause, ticket.urgency, ticket.status,
    ticket.baseStatus, ticket.service, ticket.department, excelDate(ticket.createdDate),
    excelDate(ticket.dueDate), excelDate(ticket.resolvedDate), excelDate(ticket.closedDate),
    ticket.taskNumber, ticket.taskStatus, ticket.deliveredVersion,
  ]);

  const tableRows = [
    `<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${xml(title)}</Data></Cell></Row>`,
    ...(subtitle ? [`<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${xml(subtitle)}</Data></Cell></Row>`] : []),
    `<Row><Cell ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">Exportado em ${xml(new Date().toLocaleString("pt-BR"))} · ${tickets.length} atendimento(s)</Data></Cell></Row>`,
    `<Row>${headers.map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(header)}</Data></Cell>`).join("")}</Row>`,
    ...rows.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join("")}</Row>`),
  ].join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDF6EE" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="Atendimentos"><Table>${tableRows}</Table></Worksheet>
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

export function ExportTicketsButton({ tickets, title, subtitle, startIcon }: Props) {
  return (
    <Box sx={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
      <Tooltip title={tickets.length ? `Exportar ${tickets.length} registro(s) desta listagem para Excel` : "Nenhum registro para exportar"}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={startIcon ?? <DownloadOutlined />}
            disabled={!tickets.length}
            onClick={() => exportTicketsToExcel(tickets, title, subtitle)}
            sx={{ textTransform: "none", fontWeight: 800 }}
          >
            Exportar Excel
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
