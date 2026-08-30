import {
  Card,
  CardContent,
  Typography,
} from "@mui/material";

type KpiCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
};

export function KpiCard({
  title,
  value,
  subtitle,
}: KpiCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        width: "100%",
        height: "100%",

        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.5,

        backgroundColor:
          "background.paper",

        transition:
          "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",

        "&:hover": {
          transform:
            "translateY(-1px)",

          boxShadow:
            "0 4px 12px rgba(16, 24, 40, 0.06)",

          borderColor:
            "rgba(16, 24, 40, 0.16)",
        },
      }}
    >
      <CardContent
        sx={{
          height: "100%",

          p: {
            xs: 1.5,
            sm: 1.75,
            md: 2,
          },

          "&:last-child": {
            pb: {
              xs: 1.5,
              sm: 1.75,
              md: 2,
            },
          },
        }}
      >
        {/* TÍTULO */}

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontWeight: 600,

            fontSize: {
              xs: "0.76rem",
              sm: "0.78rem",
              md: "0.8rem",
            },

            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>

        {/* VALOR */}

        <Typography
          variant="h4"
          sx={{
            mt: 0.75,

            fontWeight: 800,

            fontSize: {
              xs: "1.45rem",
              sm: "1.6rem",
              md: "1.75rem",
            },

            lineHeight: 1.1,

            color: "text.primary",

            letterSpacing:
              "-0.02em",
          }}
        >
          {typeof value === "number"
            ? value.toLocaleString(
                "pt-BR"
              )
            : value}
        </Typography>

        {/* INFORMAÇÃO COMPLEMENTAR */}

        {subtitle && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",

              mt: 0.75,

              fontSize:
                "0.7rem",

              lineHeight: 1.35,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}