import { Router } from "express";

/** Manchetes públicas para a tela de login. Não recebe URLs do cliente. */
export const cooperativeNewsRoutes = Router();

type NewsItem = { title: string; link: string; source: string; publishedAt: string | null };
let cache: { expiresAt: number; items: NewsItem[] } | null = null;

const decodeXml = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_match, number: string) => String.fromCodePoint(Number(number)))
  .replace(/<[^>]*>/g, "").trim();

const field = (xml: string, name: string) =>
  decodeXml(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml)?.[1] ?? "");

cooperativeNewsRoutes.get("/cooperatives", async (_req, res) => {
  if (cache && cache.expiresAt > Date.now()) {
    res.json({ items: cache.items, cached: true });
    return;
  }
  try {
    const query = encodeURIComponent("cooperativismo agro cooperativas agrícolas Brasil");
    const response = await fetch(`https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, {
      signal: AbortSignal.timeout(5500),
      headers: { Accept: "application/rss+xml, application/xml", "User-Agent": "TechLead-Hub/2.1" },
      redirect: "error",
    });
    if (!response.ok) throw new Error("Fonte indisponível");
    if (Number(response.headers.get("content-length") ?? 0) > 300_000) throw new Error("Feed excedeu o limite");
    const xml = await response.text();
    if (xml.length > 300_000) throw new Error("Feed excedeu o limite");
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((match) => {
      const body = match[1];
      const link = field(body, "link");
      const title = field(body, "title");
      const published = field(body, "pubDate");
      const source = field(body, "source") || "Google Notícias";
      return { title: title.slice(0, 220), link, source: source.slice(0, 80), publishedAt: Number.isNaN(Date.parse(published)) ? null : new Date(published).toISOString() };
    }).filter((item) => item.title && /^https:\/\/news\.google\.com\//.test(item.link));
    if (!items.length) throw new Error("Nenhuma notícia disponível");
    cache = { expiresAt: Date.now() + 15 * 60_000, items };
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ items, cached: false });
  } catch {
    res.status(503).json({ items: cache?.items ?? [], message: "Notícias temporariamente indisponíveis." });
  }
});
