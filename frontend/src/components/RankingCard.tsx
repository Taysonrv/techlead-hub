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

type RankingCardProps = {
  title: string;
  subtitle: string;
  data: RankingItem[];
  limit?: number;
};

export function RankingCard({
  title,
  subtitle,
  data,
  limit = 6,
}: RankingCardProps) {
  const visibleItems =
    data.slice(0, limit);

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
      }}
    >
      <CardContent
        sx={{
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
        {/* CABEÇALHO */}

        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,

            fontSize: {
              xs: "0.95rem",
              md: "1rem",
            },

            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.25,
            mb: 1.5,

            fontSize:
              "0.78rem",

            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </Typography>

        {/* SEM DADOS */}

        {visibleItems.length ===
          0 && (
          <Box
            sx={{
              py: 2.5,

              textAlign:
                "center",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize:
                  "0.78rem",
              }}
            >
              Nenhum dado disponível
            </Typography>
          </Box>
        )}

        {/* RANKING */}

        {visibleItems.map(
          (item, index) => (
            <Box
              key={`${item.label}-${index}`}
              sx={{
                display:
                  "grid",

                gridTemplateColumns:
                  "32px minmax(0, 1fr) auto",

                gap: 1,

                alignItems:
                  "center",

                py: 1,

                borderTop:
                  index === 0
                    ? "none"
                    : "1px solid",

                borderColor:
                  "divider",
              }}
            >
              {/* POSIÇÃO */}

              <Box
                sx={{
                  width: 26,
                  height: 26,

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  borderRadius:
                    "50%",

                  backgroundColor:
                    "action.hover",

                  flexShrink: 0,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      700,

                    fontSize:
                      "0.68rem",

                    lineHeight: 1,
                  }}
                >
                  {index + 1}
                </Typography>
              </Box>

              {/* DESCRIÇÃO */}

              <Typography
                variant="body2"
                title={
                  item.label
                }
                sx={{
                  minWidth: 0,

                  overflow:
                    "hidden",

                  textOverflow:
                    "ellipsis",

                  whiteSpace:
                    "nowrap",

                  fontSize:
                    "0.8rem",

                  fontWeight:
                    500,
                }}
              >
                {item.label}
              </Typography>

              {/* TOTAL */}

              <Typography
                variant="body2"
                sx={{
                  fontWeight:
                    700,

                  fontSize:
                    "0.82rem",

                  fontVariantNumeric:
                    "tabular-nums",

                  flexShrink: 0,
                }}
              >
                {item.total.toLocaleString(
                  "pt-BR"
                )}
              </Typography>
            </Box>
          )
        )}
      </CardContent>
    </Card>
  );
}