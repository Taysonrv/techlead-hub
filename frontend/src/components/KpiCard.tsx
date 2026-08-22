import { Card, CardContent, Typography } from "@mui/material";

type Props = {
  title: string;
  value: number;
};

export function KpiCard({ title, value }: Props) {
  return (
    <Card
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      <CardContent>
        <Typography
          variant="body2"
          color="text.secondary"
          fontWeight={600}
        >
          {title}
        </Typography>

        <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}