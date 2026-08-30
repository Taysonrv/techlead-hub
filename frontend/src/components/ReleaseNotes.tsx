import {
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import {
  useState,
} from "react";

import {
  releaseNotes,
  type ReleaseNoteItem,
  type ReleaseNoteType,
} from "../data/releaseNotes";

/* =========================================================
   RELEASE NOTES
========================================================= */

export function ReleaseNotes() {
  return (
    <Card
      elevation={0}
      sx={{
        mt: 2,

        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          2.5,
      }}
    >
      <CardContent
        sx={{
          p: 2,

          "&:last-child":
            {
              pb: 2,
            },
        }}
      >
        {/* =================================================
            CABEÇALHO
        ================================================= */}

        <Stack
          direction={{
            xs: "column",
            sm: "row",
          }}
          spacing={1}
          sx={{
            justifyContent:
              "space-between",

            alignItems: {
              xs: "flex-start",
              sm: "center",
            },

            mb: 1.5,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontWeight:
                  800,

                fontSize:
                  "1.05rem",
              }}
            >
              Notas de versão
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.25,
              }}
            >
              Histórico de melhorias, correções e funcionalidades do TechLead Hub.
            </Typography>
          </Box>

          <Chip
            size="small"
            variant="outlined"
            label={`${releaseNotes.length} versão(ões)`}
          />
        </Stack>

        <Divider />

        {/* =================================================
            RELEASES
        ================================================= */}

        <Box>
          {releaseNotes.map(
            (
              release,
              index
            ) => (
              <ReleaseItem
                key={
                  release.version
                }
                version={
                  release.version
                }
                date={
                  release.date
                }
                status={
                  release.status
                }
                title={
                  release.title
                }
                description={
                  release.description
                }
                items={
                  release.items
                }
                defaultOpen={
                  index === 0
                }
              />
            )
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   RELEASE
========================================================= */

function ReleaseItem({
  version,
  date,
  status,
  title,
  description,
  items,
  defaultOpen,
}: {
  version:
    string;

  date:
    string;

  status:
    "released" |
    "development";

  title:
    string;

  description?:
    string;

  items:
    ReleaseNoteItem[];

  defaultOpen:
    boolean;
}) {
  const [
    open,
    setOpen,
  ] =
    useState(
      defaultOpen
    );

  const corrections =
    items.filter(
      (item) =>
        item.type ===
        "fix"
    ).length;

  const improvements =
    items.filter(
      (item) =>
        item.type ===
        "improvement"
    ).length;

  const features =
    items.filter(
      (item) =>
        item.type ===
        "feature"
    ).length;

  return (
    <Box
      sx={{
        py: 1.5,

        borderBottom:
          "1px solid",

        borderColor:
          "divider",

        "&:last-child":
          {
            borderBottom:
              "none",

            pb: 0,
          },
      }}
    >
      {/* =================================================
          CABEÇALHO DA VERSÃO
      ================================================= */}

      <Box
        role="button"
        tabIndex={0}
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        onKeyDown={(
          event
        ) => {
          if (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          ) {
            setOpen(
              (current) =>
                !current
            );
          }
        }}
        sx={{
          cursor:
            "pointer",

          borderRadius:
            1.5,

          px: 0.75,
          py: 0.5,

          mx: -0.75,

          transition:
            "background-color 0.15s ease",

          "&:hover": {
            backgroundColor:
              "action.hover",
          },

          "&:focus-visible":
            {
              outline:
                "2px solid",

              outlineColor:
                "primary.main",

              outlineOffset:
                "2px",
            },
        }}
      >
        <Stack
          direction={{
            xs: "column",
            sm: "row",
          }}
          spacing={1}
          sx={{
            justifyContent:
              "space-between",

            alignItems: {
              xs: "flex-start",
              sm: "center",
            },
          }}
        >
          <Box
            sx={{
              minWidth: 0,
            }}
          >
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems:
                  "center",

                flexWrap:
                  "wrap",

                gap: 0.5,
              }}
            >
              <Typography
                sx={{
                  fontWeight:
                    800,

                  fontSize:
                    "1rem",

                  fontVariantNumeric:
                    "tabular-nums",
                }}
              >
                v{version}
              </Typography>

              <ReleaseStatus
                status={
                  status
                }
              />

              {indexLabel(
                status
              )}
            </Stack>

            <Typography
              variant="body2"
              sx={{
                mt: 0.35,

                fontWeight:
                  600,
              }}
            >
              {title}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
            >
              {date}
            </Typography>
          </Box>

          <Typography
            variant="caption"
            color="primary.main"
            sx={{
              fontWeight:
                700,

              flexShrink:
                0,
            }}
          >
            {open
              ? "Ocultar detalhes ↑"
              : "Ver detalhes ↓"}
          </Typography>
        </Stack>
      </Box>

      {/* =================================================
          CONTEÚDO
      ================================================= */}

      <Collapse
        in={open}
        timeout="auto"
        unmountOnExit
      >
        <Box
          sx={{
            pt: 1.5,
            pl: {
              xs: 0,
              sm: 0.75,
            },
          }}
        >
          {description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,

                lineHeight:
                  1.6,
              }}
            >
              {description}
            </Typography>
          )}

          {/* RESUMO */}

          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              mb: 1.5,

              flexWrap:
                "wrap",

              gap: 0.75,
            }}
          >
            {corrections >
              0 && (
              <Chip
                size="small"
                color="error"
                variant="outlined"
                label={`${corrections} correção(ões)`}
              />
            )}

            {improvements >
              0 && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`${improvements} melhoria(s)`}
              />
            )}

            {features >
              0 && (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`${features} novidade(s)`}
              />
            )}
          </Stack>

          {/* ITENS */}

          <Stack
            spacing={1}
          >
            {items.map(
              (
                item,
                index
              ) => (
                <ReleaseNoteRow
                  key={`${item.title}-${index}`}
                  item={
                    item
                  }
                />
              )
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

/* =========================================================
   ITEM DA RELEASE
========================================================= */

function ReleaseNoteRow({
  item,
}: {
  item:
    ReleaseNoteItem;
}) {
  return (
    <Box
      sx={{
        display:
          "grid",

        gridTemplateColumns:
          "auto minmax(0, 1fr)",

        gap: 1,

        alignItems:
          "flex-start",

        p: 1,

        borderRadius:
          1.5,

        backgroundColor:
          "action.hover",
      }}
    >
      <NoteTypeChip
        type={
          item.type
        }
      />

      <Box
        sx={{
          minWidth: 0,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight:
              700,
          }}
        >
          {item.title}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display:
              "block",

            mt: 0.25,

            lineHeight:
              1.5,
          }}
        >
          {item.description}
        </Typography>
      </Box>
    </Box>
  );
}

/* =========================================================
   TIPO
========================================================= */

function NoteTypeChip({
  type,
}: {
  type:
    ReleaseNoteType;
}) {
  if (
    type === "fix"
  ) {
    return (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        label="Correção"
      />
    );
  }

  if (
    type ===
    "improvement"
  ) {
    return (
      <Chip
        size="small"
        color="primary"
        variant="outlined"
        label="Melhoria"
      />
    );
  }

  if (
    type ===
    "feature"
  ) {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        label="Novo"
      />
    );
  }

  if (
    type ===
    "security"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label="Segurança"
      />
    );
  }

  return (
    <Chip
      size="small"
      variant="outlined"
      label="Técnico"
    />
  );
}

/* =========================================================
   STATUS
========================================================= */

function ReleaseStatus({
  status,
}: {
  status:
    "released" |
    "development";
}) {
  if (
    status ===
    "development"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        label="Em desenvolvimento"
        sx={{
          height: 22,

          fontSize:
            "0.68rem",
        }}
      />
    );
  }

  return (
    <Chip
      size="small"
      color="success"
      variant="outlined"
      label="Publicada"
      sx={{
        height: 22,

        fontSize:
          "0.68rem",
      }}
    />
  );
}

/* =========================================================
   LABEL COMPLEMENTAR
========================================================= */

function indexLabel(
  status:
    "released" |
    "development"
) {
  if (
    status ===
    "development"
  ) {
    return null;
  }

  return null;
}