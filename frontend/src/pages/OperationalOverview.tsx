import { Box } from "@mui/material";
import { DashboardOutlined, QueryStatsOutlined } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { HubNavigation } from "../components/HubNavigation";
import { Dashboard } from "./Dashboard";
import { Performance } from "./Performance";

type Section = "summary" | "performance";

export function OperationalOverview() {
  const location = useLocation();
  const navigate = useNavigate();
  const section: Section = location.pathname.endsWith("/desempenho")
    ? "performance"
    : "summary";

  return (
    <Box sx={{ minWidth: 0 }}>
      <HubNavigation<Section>
        value={section}
        ariaLabel="Visão operacional"
        caption="VISÃO OPERACIONAL"
        onChange={(value) =>
          navigate(
            value === "performance"
              ? "/visao-operacional/desempenho"
              : "/visao-operacional",
          )
        }
        items={[
          {
            value: "summary",
            label: "Resumo executivo",
            icon: <DashboardOutlined fontSize="small" />,
          },
          {
            value: "performance",
            label: "Desempenho & SLA",
            icon: <QueryStatsOutlined fontSize="small" />,
          },
        ]}
      />

      {section === "performance" ? <Performance /> : <Dashboard />}
    </Box>
  );
}
