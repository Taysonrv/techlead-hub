import { prisma } from "../database/prisma";

type ForecastDay = {
  date: string;
  condition: string;
  iconUrl: string;
  minC: number;
  maxC: number;
  chanceOfRain: number;
};

type ForecastResult = {
  location: string;
  days: ForecastDay[];
};

const WEATHER_API_BASE = "https://api.weatherapi.com/v1";
const FORECAST_TTL_MS = 30 * 60 * 1000;
const forecastCache = new Map<string, { expiresAt: number; result: ForecastResult }>();

function userError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeLocation(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("pt-BR");
}

const brazilianStateNames: Record<string, string> = {
  ac: "acre", al: "alagoas", ap: "amapa", am: "amazonas", ba: "bahia", ce: "ceara", df: "distrito federal",
  es: "espirito santo", go: "goias", ma: "maranhao", mt: "mato grosso", ms: "mato grosso do sul",
  mg: "minas gerais", pa: "para", pb: "paraiba", pr: "parana", pe: "pernambuco", pi: "piaui",
  rj: "rio de janeiro", rn: "rio grande do norte", rs: "rio grande do sul", ro: "rondonia", rr: "roraima",
  sc: "santa catarina", sp: "sao paulo", se: "sergipe", to: "tocantins",
};

const verifiedBrazilianLocations: Record<string, Record<string, unknown>> = {
  "rioverde:goias": { name: "Rio Verde", region: "Goiás", country: "Brazil", lat: -17.79, lon: -50.91 },
};

function requestedBrazilianState(value: string) {
  const normalized = normalizeLocation(value);
  return brazilianStateNames[normalized] ?? normalized;
}

export class CalendarWeatherService {
  async getLocation(userId: number) {
    const rows = await prisma.$queryRaw<Array<{ weatherCity: string | null }>>`
      SELECT "weatherCity" FROM "User" WHERE "id" = ${userId} LIMIT 1
    `;
    const user = rows[0];
    if (!user) throw userError("Usuário não localizado.", 404);
    return user.weatherCity;
  }

  async saveLocation(userId: number, value: unknown) {
    if (value !== null && value !== undefined && typeof value !== "string") {
      throw userError("Informe uma cidade válida.", 400);
    }
    const city = typeof value === "string" ? value.trim() : "";
    if (city.length > 120) throw userError("A cidade deve ter até 120 caracteres.", 400);
    const updated = await prisma.$executeRaw`
      UPDATE "User" SET "weatherCity" = ${city || null}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${userId}
    `;
    if (updated === 0) throw userError("Usuário não localizado.", 404);
    return city || null;
  }

  async getForecast(userId: number) {
    const city = await this.getLocation(userId);
    const apiKey = process.env.WEATHER_API_KEY?.trim() ?? "";
    if (!apiKey) return { configured: false, city, location: null, days: [] as ForecastDay[] };
    if (!city) return { configured: true, city: null, location: null, days: [] as ForecastDay[] };

    const cacheKey = `br-state-v2:${normalizeLocation(city)}`;
    const cached = forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { configured: true, city, ...cached.result };
    }

    // Resolve the city and state explicitly before requesting its forecast. The forecast
    // endpoint may otherwise silently pick a same-named place in a different Brazilian state.
    const cityParts = city.split(",").map((part) => part.trim()).filter(Boolean);
    const searchParts = cityParts.filter((part) => !["brasil", "brazil"].includes(normalizeLocation(part)));
    const cityName = searchParts[0] ?? city;
    const stateHint = searchParts[1] ?? "";
    const searchQueries = stateHint
      ? [`${cityName}, ${stateHint}`, `${cityName}, Brazil`, cityName]
      : [`${cityName}, Brazil`, cityName];
    const candidates: Record<string, unknown>[] = [];
    const knownLocationKey = `${normalizeLocation(cityName)}:${stateHint ? requestedBrazilianState(stateHint) : ""}`;
    let matchingLocation: Record<string, unknown> | undefined = verifiedBrazilianLocations[knownLocationKey];
    let searchSucceeded = false;

    for (const query of matchingLocation ? [] : [...new Set(searchQueries)]) {
      const searchUrl = new URL(`${WEATHER_API_BASE}/search.json`);
      searchUrl.searchParams.set("key", apiKey);
      searchUrl.searchParams.set("q", query);
      let searchResponse: Response;
      try {
        searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
      } catch {
        continue;
      }
      const searchBody = await searchResponse.json().catch(() => null) as unknown;
      if (!searchResponse.ok || !Array.isArray(searchBody)) {
        const searchError = searchBody && typeof searchBody === "object" && !Array.isArray(searchBody)
          ? (searchBody as Record<string, unknown>).error as Record<string, unknown> | undefined
          : undefined;
        const code = Number(searchError?.code);
        if (code === 2006 || code === 2007 || code === 2008 || code === 2009) {
          throw userError("A chave de previsão do tempo está inválida, sem acesso ou atingiu o limite de uso.", 503);
        }
        continue;
      }

      searchSucceeded = true;
      candidates.push(...searchBody.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")));
      const exactCityCandidates = candidates.filter((item) =>
        normalizeLocation(String(item.name ?? "")) === normalizeLocation(cityName) &&
        normalizeLocation(String(item.country ?? "")) === "brazil",
      );
      matchingLocation = stateHint
        ? exactCityCandidates.find((item) => {
            const region = normalizeLocation(String(item.region ?? ""));
            const requested = requestedBrazilianState(stateHint);
            return Boolean(region) && (region === requested || region.endsWith(requested) || requested.endsWith(region));
          })
        : exactCityCandidates.length === 1 ? exactCityCandidates[0] : undefined;
      if (matchingLocation) break;
    }

    if (!searchSucceeded && !matchingLocation) {
      throw userError("Não foi possível localizar essa cidade agora. Tente novamente mais tarde.", 502);
    }
    const exactCityCandidates = candidates.filter((item) =>
      normalizeLocation(String(item.name ?? "")) === normalizeLocation(cityName) &&
      normalizeLocation(String(item.country ?? "")) === "brazil",
    );

    if (!matchingLocation) {
      if (exactCityCandidates.length > 1 && !stateHint) {
        throw userError("Há mais de uma cidade com esse nome. Informe também o estado, por exemplo: Rio Verde, GO.", 400);
      }
      throw userError(`Não localizei ${cityName}${stateHint ? `, ${stateHint}` : ""} no Brasil. Confira a cidade e a sigla ou nome do estado.`, 400);
    }

    const latitude = Number(matchingLocation.lat);
    const longitude = Number(matchingLocation.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw userError("O provedor não retornou coordenadas válidas para essa cidade.", 502);
    }

    const url = new URL(`${WEATHER_API_BASE}/forecast.json`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", `${latitude},${longitude}`);
    url.searchParams.set("days", "3");
    url.searchParams.set("aqi", "no");
    url.searchParams.set("alerts", "no");
    url.searchParams.set("lang", "pt");

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw userError("Não foi possível consultar a previsão agora. Tente novamente mais tarde.", 502);
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !body) {
      const providerError = body && typeof body.error === "object" && body.error !== null
        ? body.error as Record<string, unknown>
        : {};
      const code = Number(providerError.code);
      if (code === 1006) throw userError("Cidade não localizada. Informe cidade e estado, por exemplo: Curitiba, PR.", 400);
      if (code === 2006 || code === 2007 || code === 2008) {
        throw userError("A chave de previsão do tempo está inválida ou sem acesso.", 503);
      }
      throw userError("O provedor de previsão não respondeu corretamente. Tente novamente mais tarde.", 502);
    }

    const location = body.location && typeof body.location === "object" ? body.location as Record<string, unknown> : {};
    const forecast = body.forecast && typeof body.forecast === "object" ? body.forecast as Record<string, unknown> : {};
    const forecastDays = Array.isArray(forecast.forecastday) ? forecast.forecastday as Array<Record<string, unknown>> : [];
    const days = forecastDays.map((entry) => {
      const day = entry.day && typeof entry.day === "object" ? entry.day as Record<string, unknown> : {};
      const condition = day.condition && typeof day.condition === "object" ? day.condition as Record<string, unknown> : {};
      return {
        date: String(entry.date ?? ""),
        condition: String(condition.text ?? "Sem descrição"),
        iconUrl: typeof condition.icon === "string" && condition.icon.startsWith("//cdn.weatherapi.com/")
          ? `https:${condition.icon}`
          : "",
        minC: safeNumber(day.mintemp_c),
        maxC: safeNumber(day.maxtemp_c),
        chanceOfRain: safeNumber(day.daily_chance_of_rain),
      };
    }).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date));

    const result = {
      location: [location.name, location.region, location.country].filter((part) => typeof part === "string" && part.trim()).join(", "),
      days,
    };
    forecastCache.set(cacheKey, { expiresAt: Date.now() + FORECAST_TTL_MS, result });
    return { configured: true, city, ...result };
  }
}

export const calendarWeatherService = new CalendarWeatherService();
