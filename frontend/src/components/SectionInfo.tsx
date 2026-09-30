import { IconButton, Tooltip } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";

export function SectionInfo({ title }: { title: string }) {
  return <Tooltip arrow placement="top" title={title}>
    <IconButton size="small" aria-label="Informações" sx={{ ml: .45, p: .35, color: "text.secondary", "&:hover": { color: "primary.main", bgcolor: "action.hover" } }}>
      <InfoOutlined sx={{ fontSize: 17 }} />
    </IconButton>
  </Tooltip>;
}
