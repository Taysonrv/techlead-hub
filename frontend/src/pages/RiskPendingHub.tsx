import { Box } from "@mui/material";
import { FactCheckOutlined, WarningAmberOutlined } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { HubNavigation } from "../components/HubNavigation";
import { Attention } from "./Attention";
import { DataQuality } from "./DataQuality";

type Section = "risk" | "quality";

export function RiskPendingHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const section: Section = location.pathname.endsWith("/qualidade")
    ? "quality"
    : "risk";

  return (
    <Box sx={{ minWidth: 0 }}>
      <HubNavigation<Section>
        value={section}
        ariaLabel="Pendências e riscos"
        caption="PENDÊNCIAS & RISCOS"
        onChange={(value) =>
          navigate(
            value === "quality"
              ? "/pendencias-riscos/qualidade"
              : "/pendencias-riscos",
          )
        }
        items={[
          {
            value: "risk",
            label: "Riscos & Atenção",
            icon: <WarningAmberOutlined fontSize="small" />,
          },
          {
            value: "quality",
            label: "Qualidade & Governança",
            icon: <FactCheckOutlined fontSize="small" />,
          },
        ]}
      />

      {section === "quality" ? <DataQuality /> : <Attention />}
    </Box>
  );
}
