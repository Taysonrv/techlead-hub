import {
  Box,
  Card,
  CardContent,
  Typography,
} from "@mui/material";

type RankingItem = {
  label: string;
  total: number;
};

type Props = {
  title: string;
  subtitle: string;
  data: RankingItem[];
};

export function RankingCard({
  title,
  subtitle,
  data,
}: Props) {
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
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          {subtitle}
        </Typography>

        {data.slice(0, 6).map((item, index) => (
          <Box
            key={`${item.label}-${index}`}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              py: 1.25,
              borderTop: index === 0 ? "none" : "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography>{item.label}</Typography>

            <Typography fontWeight={700}>
              {item.total}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}