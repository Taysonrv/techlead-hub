import { Box } from "@mui/material";
import { ConfirmationNumberOutlined, ViewKanbanOutlined } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { HubNavigation } from "../components/HubNavigation";
import { Tickets } from "./Tickets";
import { MyOperation } from "./MyOperation";

type Section = "tickets" | "mine";

export function OperationsHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const section: Section = location.pathname.endsWith("/minha-operacao")
    ? "mine"
    : "tickets";

  return (
    <Box sx={{ minWidth: 0 }}>
      <HubNavigation<Section>
        value={section}
        ariaLabel="Operação"
        caption="OPERAÇÃO"
        onChange={(value) =>
          navigate(
            value === "mine"
              ? "/operacao/minha-operacao"
              : "/operacao/tickets",
          )
        }
        items={[
          {
            value: "tickets",
            label: "Tickets",
            icon: <ConfirmationNumberOutlined fontSize="small" />,
          },
          {
            value: "mine",
            label: "Minha Operação",
            icon: <ViewKanbanOutlined fontSize="small" />,
          },
        ]}
      />

      {section === "mine" ? <MyOperation /> : <Tickets />}
    </Box>
  );
}
