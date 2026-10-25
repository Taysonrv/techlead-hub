import { SearchOutlined } from "@mui/icons-material";
import { Box, TextField } from "@mui/material";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function ConversationListSearch({ value, onChange }: Props) {
  return (
    <Box sx={{ px: 1.25, pb: 1 }}>
      <TextField
        size="small"
        fullWidth
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar conversa..."
        slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }}
        aria-label="Buscar conversa"
      />
    </Box>
  );
}
