import { SearchOutlined } from "@mui/icons-material";
import { Box, TextField } from "@mui/material";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function ConversationListSearch({ value, onChange }: Props) {
  return (
    <Box sx={{ px: 1.75, pb: 1.75 }}>
      <TextField
        size="small"
        fullWidth
        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 5, bgcolor: "action.hover", "& fieldset": { borderColor: "transparent" }, "&:hover fieldset": { borderColor: "divider" } } }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Pesquisar pessoas ou canais"
        slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }}
        aria-label="Buscar conversa"
      />
    </Box>
  );
}
