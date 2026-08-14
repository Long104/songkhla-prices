export interface ScrapedPrice {
  sourceProductName: string;
  price: number;
  unit: string;
  provinceCode: string | null;
  sourceDate: Date;
  /** Raw product title or context text — used for weight extraction at ingest */
  productTitle?: string;
}

export interface Scraper {
  sourceSlug: string;
  scrape(): Promise<ScrapedPrice[]>;
}

/** 15s timeout: government sites are slow and can hang without one. */
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PriceCompareBot/1.0)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return await res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

export function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
