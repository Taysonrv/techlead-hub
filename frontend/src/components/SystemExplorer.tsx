import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  AccountTreeOutlined,
  ChevronRight,
  ContentCopyOutlined,
  DescriptionOutlined,
  ExpandMore,
  FolderOutlined,
  HubOutlined,
  InfoOutlined,
  OpenInNewOutlined,
  RuleOutlined,
  SearchOutlined,
  SchemaOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import { api } from "../services/api";
import { SimerMapTree, type SimerTreeNode } from "./SimerMapTree";

type Process = {
  id: number;
  name: string;
  sourceFile: string;
  folderPath?: string | null;
  steps?: number;
};

type Catalog = {
  name: string;
  type: string;
  processes: Process[];
  children: Catalog[];
  total?: number;
};

type RuleNode = {
  id: number;
  externalId: string;
  name: string;
  kind: string;
  documentation: string | null;
};

export type SystemMapItem = {
  id: number;
  sourceFile: string;
  mapName: string;
  nodeText: string;
  path: string;
  nodeKind: string | null;
  correlationScore?: number;
  reasons?: string[];
};

type Element = {
  id: number;
  name: string;
  kind: string;
  mapName: string;
  path: string;
  score: number;
};

type Detail = {
  process: {
    id: number;
    name: string;
    folderPath: string | null;
    sourceFile: string;
  };
  nodes: RuleNode[];
  transitions: Array<{
    id: number;
    fromId: string;
    toId: string;
    name: string | null;
    condition: string | null;
  }>;
  maps: SystemMapItem[];
  correlations: SystemMapItem[];
  elements: Element[];
  relatedProcesses: Process[];
  stats: {
    steps: number;
    maps: number;
    technicalPoints: number;
    correlations: number;
  };
};

function catalogMatches(node: Catalog, query: string): boolean {
  if (!query) return true;
  if (node.name.toLowerCase().includes(query)) return true;
  if (node.processes.some((process) => process.name.toLowerCase().includes(query))) return true;
  return node.children.some((child) => catalogMatches(child, query));
}

function Branch({
  node,
  onOpen,
  filter,
  level = 0,
  selected,
}: {
  node: Catalog;
  onOpen: (process: Process) => void;
  filter: string;
  level?: number;
  selected?: number;
}) {
  const [open, setOpen] = useState(level < 2);
  const query = filter.toLowerCase().trim();

  if (!catalogMatches(node, query)) return null;

  const visibleProcesses = node.processes.filter(
    (process) =>
      !query ||
      process.name.toLowerCase().includes(query) ||
      node.name.toLowerCase().includes(query),
  );

  return (
    <Box>
      <Box
        onClick={() => setOpen((value) => !value)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          py: 0.5,
          pl: level * 0.8,
          cursor: "pointer",
          borderRadius: 1.5,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {open ? <ExpandMore sx={{ fontSize: 18 }} /> : <ChevronRight sx={{ fontSize: 18 }} />}
        <FolderOutlined sx={{ fontSize: 17, color: level < 2 ? "warning.main" : "text.secondary" }} />
        <Typography variant="body2" sx={{ fontWeight: level < 2 ? 850 : 650, flex: 1 }}>
          {node.name}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={node.total ?? node.processes.length + node.children.length}
          sx={{ height: 20 }}
        />
      </Box>

      <Collapse in={open || Boolean(query)}>
        {visibleProcesses.map((process) => (
          <Box
            key={process.id}
            onClick={() => onOpen(process)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.7,
              py: 0.55,
              pl: (level + 2) * 0.8,
              cursor: "pointer",
              borderRadius: 1.5,
              bgcolor: selected === process.id ? "rgba(24,199,122,.14)" : "transparent",
              color: selected === process.id ? "primary.main" : "inherit",
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            <DescriptionOutlined sx={{ fontSize: 16 }} />
            <Typography
              variant="body2"
              sx={{ fontWeight: selected === process.id ? 850 : 500, flex: 1 }}
            >
              {process.name}
            </Typography>
            {process.steps != null && <Chip size="small" label={process.steps} sx={{ height: 19 }} />}
          </Box>
        ))}

        {node.children.map((child) => (
          <Branch
            key={child.name}
            node={child}
            onOpen={onOpen}
            filter={filter}
            level={level + 1}
            selected={selected}
          />
        ))}
      </Collapse>
    </Box>
  );
}

function EmptyState() {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, minHeight: 500, display: "grid", placeItems: "center" }}>
      <CardContent sx={{ textAlign: "center", maxWidth: 560 }}>
        <AccountTreeOutlined sx={{ fontSize: 58, color: "text.disabled" }} />
        <Typography variant="h6" sx={{ fontWeight: 950, mt: 1 }}>
          Selecione uma rotina na estrutura
        </Typography>
        <Typography color="text.secondary">
          Abra módulo, seção e processo na árvore. A rotina será apresentada com regra Bizagi,
          mapas .mm, elementos técnicos e relacionamentos encontrados automaticamente.
        </Typography>
      </CardContent>
    </Card>
  );
}

export function SystemExplorer({
  onOpenMap,
}: {
  onOpenMap: (item: SystemMapItem) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMap, setSelectedMap] = useState<SystemMapItem | null>(null);
  const [mapTree, setMapTree] = useState<SimerTreeNode[]>([]);
  const [tab, setTab] = useState(0);
  const [rightTab, setRightTab] = useState(0);

  useEffect(() => {
    void api.get<Catalog>("/simer-map/catalog").then((response) => setCatalog(response.data));
  }, []);

  async function openRoutine(process: Process) {
    setLoading(true);
    setSelectedMap(null);
    setMapTree([]);
    setTab(0);

    try {
      const response = await api.get<Detail>(`/simer-map/catalog/routines/${process.id}`);
      setDetail(response.data);
    } finally {
      setLoading(false);
    }
  }

  async function openMap(item: SystemMapItem) {
    setSelectedMap(item);
    const response = await api.get<{ items: SimerTreeNode[] }>("/simer-map/tree", {
      params: { sourceFile: item.sourceFile, focusId: item.id },
    });
    setMapTree(response.data.items);
    onOpenMap(item);
  }

  async function openContainer(node: SimerTreeNode) {
    const resolved = await api.get<{ item: SystemMapItem | null }>(
      `/simer-map/nodes/${node.id}/container`,
    );
    if (resolved.data.item) {
      await openMap(resolved.data.item);
    }
  }

  async function followMapLink(node: SimerTreeNode) {
    const resolved = await api.get<{ item: SystemMapItem | null }>(
      `/simer-map/nodes/${node.id}/follow`,
    );
    if (resolved.data.item) {
      await openMap(resolved.data.item);
    }
  }

  const path = (detail?.process.folderPath ?? "").replace(/\\/g, " / ");
  const segments = path.split(" / ").filter(Boolean);
  const moduleName = segments.length >= 3 ? segments[segments.length - 3] : segments[0] ?? "SIMER";
  const sectionName =
    segments.length >= 2 ? segments[segments.length - 2] : segments[0] ?? "Processos";
  const categoryName = segments.length ? segments[segments.length - 1] : "Rotina";
  const breadcrumb = segments.join(" › ");

  const grouped = useMemo(() => {
    const groups = new Map<string, Element[]>();
    for (const element of detail?.elements ?? []) {
      const key = element.kind || "elemento";
      groups.set(key, [...(groups.get(key) ?? []), element]);
    }
    return [...groups.entries()];
  }, [detail]);

  const description = detail?.nodes.find((node) => node.documentation)?.documentation;

  const relatedElements = useMemo(() => {
    if (!detail) return [];
    return detail.elements.filter((element) => {
      const value = `${element.kind} ${element.name}`;
      if (rightTab === 0) return /field|campo|property|atrib/i.test(value);
      if (rightTab === 1) return /service|servi|method|metodo|api|integra/i.test(value);
      return /rule|regra|valid|gateway/i.test(value);
    });
  }, [detail, rightTab]);

  const tabElements = useMemo(() => {
    if (!detail) return [];
    return grouped
      .filter(([kind]) =>
        tab === 3
          ? !/service|servi|method|metodo|integra/i.test(kind)
          : /service|servi|method|metodo|integra/i.test(kind),
      )
      .flatMap(([, elements]) => elements);
  }, [detail, grouped, tab]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "310px minmax(0,1fr) 300px" },
        gap: 1.25,
        mt: 1.25,
        alignItems: "start",
      }}
    >
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          position: { lg: "sticky" },
          top: { lg: 8 },
          maxHeight: { lg: "calc(100vh - 92px)" },
          overflow: "auto",
        }}
      >
        <CardContent sx={{ p: 1.7 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <AccountTreeOutlined color="primary" />
            <Box>
              <Typography sx={{ fontWeight: 950 }}>Estrutura do Sistema</Typography>
              <Typography variant="caption" color="text.secondary">
                Hierarquia funcional do SIMER.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={0.7}>
            <TextField
              fullWidth
              size="small"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Buscar no sistema..."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button variant="outlined" sx={{ minWidth: 40, p: 0 }}>
              <SettingsOutlined fontSize="small" />
            </Button>
          </Stack>

          <Divider sx={{ my: 1.1 }} />

          {catalog ? (
            <Branch
              node={catalog}
              onOpen={(process) => void openRoutine(process)}
              filter={filter}
              selected={detail?.process.id}
            />
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </CardContent>
      </Card>

      <Box>
        {loading ? (
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ py: 10, textAlign: "center" }}>
              <CircularProgress />
              <Typography sx={{ mt: 1 }}>Cruzando regra, fluxo e mapa técnico...</Typography>
            </CardContent>
          </Card>
        ) : !detail ? (
          <EmptyState />
        ) : (
          <Stack spacing={1.5}>
            <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
              <CardContent sx={{ p: 1.8 }}>
                <Typography variant="caption" color="text.secondary">
                  SIMER{breadcrumb ? ` › ${breadcrumb}` : ""}
                </Typography>

                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.3}
                  sx={{ alignItems: { md: "center" }, mt: 0.7 }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(24,199,122,.16)",
                      color: "primary.main",
                    }}
                  >
                    <HubOutlined />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 950 }}>
                      {detail.process.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {description ||
                        "Rotina identificada na base funcional e correlacionada automaticamente com os mapas técnicos do SIMER."}
                    </Typography>
                  </Box>
                  <Chip color="success" size="small" label="Mapeada" />
                </Stack>

                <Stack direction="row" spacing={0.7} useFlexGap sx={{ flexWrap: "wrap", mt: 1.3 }}>
                  <Chip size="small" variant="outlined" label={`Módulo · ${moduleName}`} />
                  <Chip size="small" variant="outlined" label={`Seção · ${sectionName}`} />
                  <Chip size="small" variant="outlined" label={`Categoria · ${categoryName}`} />
                  <Chip size="small" variant="outlined" label="Tipo · Rotina" />
                  <Chip size="small" color="success" label="Ativa" />
                </Stack>

                <Stack direction="row" spacing={0.7} useFlexGap sx={{ flexWrap: "wrap", mt: 0.8 }}>
                  <Chip size="small" label={`${detail.stats.steps} etapas`} />
                  <Chip size="small" label={`${detail.stats.maps} mapas`} />
                  <Chip size="small" label={`${detail.stats.technicalPoints} pontos técnicos`} />
                  <Chip size="small" color="primary" label={`${detail.stats.correlations} correlações`} />
                </Stack>
              </CardContent>

              <Divider />

              <Tabs
                value={tab}
                onChange={(_, value: number) => setTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ px: 1 }}
              >
                <Tab label="Visão Geral" />
                <Tab label="Fluxo de Negócio" />
                <Tab label="Mapa Técnico" />
                <Tab label="Campos e Regras" />
                <Tab label="Serviços e Integrações" />
              </Tabs>
            </Card>

            {tab === 0 && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
                  gap: 1.5,
                }}
              >
                <Card variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                      <DescriptionOutlined color="primary" />
                      <Typography sx={{ fontWeight: 900 }}>Descrição da Rotina</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ lineHeight: 1.75 }}>
                      {description ||
                        "A documentação detalhada desta rotina ainda não está preenchida no fluxo importado. As etapas e associações técnicas abaixo foram obtidas das bases Bizagi e .mm."}
                    </Typography>
                    <Divider sx={{ my: 1.4 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 0.6 }}>
                      Etapas principais
                    </Typography>
                    {detail.nodes.slice(0, 5).map((node, index) => (
                      <Stack
                        key={node.id}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", py: 0.35 }}
                      >
                        <Chip size="small" label={index + 1} sx={{ width: 25 }} />
                        <Typography variant="body2">{node.name}</Typography>
                      </Stack>
                    ))}
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                      <InfoOutlined color="primary" />
                      <Typography sx={{ fontWeight: 900 }}>Informações</Typography>
                    </Stack>
                    <Box sx={{ display: "grid", gridTemplateColumns: "145px 1fr", rowGap: 0.75 }}>
                      {[
                        ["Caminho", path || "SIMER"],
                        ["Fonte funcional", detail.process.sourceFile],
                        ["Etapas", detail.stats.steps],
                        ["Mapas técnicos", detail.stats.maps],
                        ["Pontos técnicos", detail.stats.technicalPoints],
                        ["Correlações", detail.stats.correlations],
                      ].map(([key, value]) => (
                        <Box key={String(key)} sx={{ display: "contents" }}>
                          <Typography variant="body2" color="text.secondary">
                            {key}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 650, overflowWrap: "anywhere" }}
                          >
                            {value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                      <RuleOutlined color="primary" />
                      <Typography sx={{ fontWeight: 900 }}>Fluxo de Negócio (Bizagi)</Typography>
                      <Chip size="small" label={`${detail.nodes.length} etapas`} />
                    </Stack>
                    <Box sx={{ display: "flex", gap: 0.7, overflowX: "auto", pb: 1 }}>
                      {detail.nodes.slice(0, 8).map((node, index) => (
                        <Box
                          key={node.id}
                          sx={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}
                        >
                          <Box
                            sx={{
                              width: 145,
                              minHeight: 74,
                              p: 1,
                              border: "1px solid",
                              borderColor: node.kind === "gateway" ? "warning.main" : "divider",
                              borderRadius: node.kind === "gateway" ? 5 : 2,
                              bgcolor: "background.paper",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              {node.kind}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>
                              {node.name}
                            </Typography>
                          </Box>
                          {index < Math.min(detail.nodes.length, 8) - 1 && (
                            <Typography sx={{ mx: 0.2, color: "text.disabled" }}>→</Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                    <Button size="small" onClick={() => setTab(1)}>
                      Abrir fluxo completo
                    </Button>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                      <SchemaOutlined color="primary" />
                      <Typography sx={{ fontWeight: 900 }}>Mapa Técnico (.mm)</Typography>
                      <Chip size="small" label={`${detail.maps.length} mapas`} />
                    </Stack>

                    {detail.maps.slice(0, 4).map((map) => (
                      <Box
                        key={map.sourceFile}
                        sx={{ py: 0.7, borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <Stack direction="row" spacing={0.7} sx={{ alignItems: "center" }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, flex: 1 }}>
                            {map.mapName}
                          </Typography>
                          <Button size="small" onClick={() => void openMap(map)}>
                            Abrir
                          </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {map.path}
                        </Typography>
                      </Box>
                    ))}

                    <Button size="small" sx={{ mt: 0.7 }} onClick={() => setTab(2)}>
                      Ver mapa técnico
                    </Button>
                  </CardContent>
                </Card>
              </Box>
            )}

            {tab === 1 && (
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography sx={{ fontWeight: 900, mb: 1 }}>Fluxo funcional completo</Typography>
                  <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 1.5 }}>
                    {detail.nodes.map((node, index) => (
                      <Box
                        key={node.id}
                        sx={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}
                      >
                        <Box
                          sx={{
                            width: 205,
                            minHeight: 115,
                            p: 1.2,
                            border: "1px solid",
                            borderColor: node.kind === "gateway" ? "warning.main" : "divider",
                            borderRadius: node.kind === "gateway" ? 6 : 2.5,
                          }}
                        >
                          <Chip size="small" variant="outlined" label={node.kind} />
                          <Typography variant="body2" sx={{ fontWeight: 850, mt: 0.6 }}>
                            {node.name}
                          </Typography>
                          {node.documentation && (
                            <Typography variant="caption" color="text.secondary">
                              {node.documentation}
                            </Typography>
                          )}
                        </Box>
                        {index < detail.nodes.length - 1 && <Typography sx={{ mx: 0.5 }}>→</Typography>}
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {tab === 2 && (
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 900 }}>Mapa Técnico da Rotina</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Selecione um mapa para abrir apenas o recorte associado à rotina.
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "260px 1fr" },
                      gap: 1.5,
                    }}
                  >
                    <Stack spacing={0.7}>
                      {detail.maps.map((map) => (
                        <Box
                          key={map.sourceFile}
                          onClick={() => void openMap(map)}
                          sx={{
                            p: 1,
                            border: "1px solid",
                            borderColor:
                              selectedMap?.sourceFile === map.sourceFile ? "primary.main" : "divider",
                            borderRadius: 2,
                            cursor: "pointer",
                            bgcolor:
                              selectedMap?.sourceFile === map.sourceFile
                                ? "action.selected"
                                : "transparent",
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 850 }}>
                            {map.mapName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {map.nodeText}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>

                    <Box
                      sx={{
                        minHeight: 340,
                        p: 1,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        overflow: "auto",
                      }}
                    >
                      {mapTree.length ? (
                        <SimerMapTree
                          items={mapTree}
                          focusId={selectedMap?.id ?? null}
                          onSelect={() => undefined}
                          onFollowLink={(node) => void followMapLink(node)}
                          onOpenContainer={(node) => void openContainer(node)}
                        />
                      ) : (
                        <Box sx={{ textAlign: "center", py: 8 }}>
                          <SchemaOutlined sx={{ fontSize: 44, color: "text.disabled" }} />
                          <Typography color="text.secondary">
                            Selecione um mapa relacionado.
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}

            {(tab === 3 || tab === 4) && (
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography sx={{ fontWeight: 900, mb: 1 }}>
                    {tab === 3 ? "Campos e Regras" : "Serviços e Integrações"}
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" },
                      gap: 1,
                    }}
                  >
                    {tabElements.map((element) => (
                      <Box
                        key={element.id}
                        sx={{
                          p: 1.1,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 2,
                        }}
                      >
                        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
                          <Chip size="small" variant="outlined" label={element.kind} />
                          <Typography variant="body2" sx={{ fontWeight: 850 }}>
                            {element.name}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {element.mapName} · {element.path}
                        </Typography>
                      </Box>
                    ))}

                    {!tabElements.length && (
                      <Typography variant="body2" color="text.secondary">
                        Nenhum elemento desta categoria foi correlacionado com a rotina.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ position: { lg: "sticky" }, top: { lg: 12 } }}>
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<HubOutlined />}
                disabled={!detail}
                onClick={() => setTab(0)}
              >
                Investigar
              </Button>
              <Button variant="outlined" disabled={!detail}>
                ☆
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
            <Typography sx={{ fontWeight: 900, p: 1.5, pb: 0.6 }}>
              Elementos Relacionados
            </Typography>

            <Tabs
              value={rightTab}
              onChange={(_, value: number) => setRightTab(value)}
              variant="fullWidth"
              sx={{
                minHeight: 36,
                "& .MuiTab-root": {
                  minHeight: 36,
                  p: 0.5,
                  fontSize: 12,
                  textTransform: "none",
                },
              }}
            >
              <Tab
                label={`Campos (${
                  detail?.elements.filter((element) =>
                    /field|campo|property|atrib/i.test(`${element.kind} ${element.name}`),
                  ).length ?? 0
                })`}
              />
              <Tab
                label={`Serviços (${
                  detail?.elements.filter((element) =>
                    /service|servi|method|metodo|api|integra/i.test(
                      `${element.kind} ${element.name}`,
                    ),
                  ).length ?? 0
                })`}
              />
              <Tab
                label={`Regras (${
                  detail?.elements.filter((element) =>
                    /rule|regra|valid|gateway/i.test(`${element.kind} ${element.name}`),
                  ).length ?? 0
                })`}
              />
            </Tabs>

            <Divider />

            {detail ? (
              <Box sx={{ p: 1.3 }}>
                {relatedElements.slice(0, 8).map((element) => (
                  <Stack
                    key={element.id}
                    direction="row"
                    spacing={0.8}
                    sx={{ py: 0.6, alignItems: "flex-start" }}
                  >
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 1,
                        bgcolor: "action.hover",
                        display: "grid",
                        placeItems: "center",
                        color: rightTab === 2 ? "error.main" : "primary.main",
                      }}
                    >
                      {rightTab === 2 ? (
                        <RuleOutlined sx={{ fontSize: 15 }} />
                      ) : (
                        <DescriptionOutlined sx={{ fontSize: 15 }} />
                      )}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {element.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {element.mapName}
                      </Typography>
                    </Box>
                    <Chip size="small" label={element.kind} sx={{ height: 20, fontSize: 10 }} />
                  </Stack>
                ))}

                {!relatedElements.length && (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum elemento desta categoria foi correlacionado.
                  </Typography>
                )}

                <Button
                  size="small"
                  sx={{ mt: 0.5 }}
                  onClick={() => setTab(rightTab === 1 ? 4 : 3)}
                >
                  Ver todos os elementos →
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
                Selecione uma rotina.
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>Rotinas Relacionadas</Typography>
            {detail?.relatedProcesses?.length ? (
              detail.relatedProcesses.map((process) => (
                <Box
                  key={process.id}
                  onClick={() => void openRoutine(process)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.7,
                    py: 0.65,
                    cursor: "pointer",
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  <DescriptionOutlined sx={{ fontSize: 17 }} />
                  <Typography variant="body2" sx={{ fontWeight: 750, flex: 1 }}>
                    {process.name}
                  </Typography>
                  <Chip size="small" label={process.steps ?? 0} />
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Nenhuma rotina irmã identificada.
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 900, mb: 1 }}>Ações Rápidas</Typography>
            <Stack spacing={0.7}>
              <Button
                variant="outlined"
                startIcon={<OpenInNewOutlined />}
                disabled={!detail?.maps.length}
                onClick={() => {
                  const firstMap = detail?.maps[0];
                  if (firstMap) void openMap(firstMap);
                }}
              >
                Abrir no mapa
              </Button>
              <Button
                variant="outlined"
                startIcon={<RuleOutlined />}
                disabled={!detail}
                onClick={() => setTab(1)}
              >
                Ver regra completa
              </Button>
              <Button
                variant="text"
                startIcon={<ContentCopyOutlined />}
                disabled={!detail}
                onClick={() => {
                  if (detail) {
                    void navigator.clipboard.writeText(
                      `SIMER / ${path} / ${detail.process.name}`,
                    );
                  }
                }}
              >
                Copiar caminho
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
