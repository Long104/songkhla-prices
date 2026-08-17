/**
 * Coverage audit — pre-deploy check that detects mapped products whose latest
 * persisted price is absent or too old.
 *
 * For every product-source mapping it reports PRESENT / STALE / MISSING in a
 * product x source x unit matrix, plus any scraped price rows that are not
 * backed by a mapping (unmapped).
 *
 * Invocation:
 *   pnpm exec tsx --env-file=.env.local scripts/dev/coverage-audit.ts [--json]
 *   RECENCY_WINDOW_HOURS=48 (default) overrides the base cutoff.
 *
 * Exit codes:
 *   0  all mapped rows PRESENT (or explained), no unresolved gaps
 *   1  DB unavailable, or any unresolved MISSING / STALE row remains
 */
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/* ------------------------------------------------------------------ */
/* Types (exported for unit tests)                                     */
/* ------------------------------------------------------------------ */

export interface ProductInfo {
  id: number;
  slug: string;
  nameTh: string;
}

export interface SourceInfo {
  id: number;
  slug: string;
}

/**
 * One cell of the product x source x unit matrix.
 *
 * `unit` is the unit this row represents. It is inferred from historical
 * price rows (see SPEC OPEN DECISION below) — it is `null` only when the
 * mapping has NO historical price row at all, in which case the row is
 * reported MISSING with unit=null ("all expected units absent") rather than
 * silently skipped or fabricated. This deterministically distinguishes
 * "no expected unit yet" from "scraper failed to write a row".
 */
export interface MappedCoverage {
  product: ProductInfo;
  source: SourceInfo;
  unit: string | null;
  latestPrice: { scrapedAt: Date; price: string } | null;
}

export type CoverageState = "PRESENT" | "STALE" | "MISSING";

export interface CoverageStatus {
  status: CoverageState;
  reason: string;
}

/** A single formatted matrix row (already classified). */
export interface CoverageRow {
  productSlug: string;
  source: string;
  unit: string | null;
  status: CoverageState;
  lastScraped: Date | null;
  reason: string;
}

/** A scraped price row whose (product, source) has no mapping. */
export interface UnmappedProduct {
  source: { slug: string };
  rawProductName: string;
  unit: string;
  scrapedAt: Date;
}

export interface ReportCounts {
  mapped: number;
  present: number;
  stale: number;
  missing: number;
  unmapped: number;
}

export interface ReportResult {
  report: string;
  counts: ReportCounts;
  exitCode: 0 | 1;
}

/* ------------------------------------------------------------------ */
/* Source cadence configuration                                        */
/* ------------------------------------------------------------------ */

/**
 * Per-source recency cutoff in hours. A mapped row is STALE when its latest
 * price is older than its source's cutoff.
 *
 * SPEC OPEN DECISION — unit inference:
 *   Mappings carry no unit column, but the report matrix is product x source x
 *   unit. We infer the expected unit set per (product, source) from the
 *   DISTINCT units observed in historical `prices` rows (the grouped latest
 *   query yields these). A mapping with zero historical price rows cannot
 *   have its expected unit known, so it is reported once as MISSING with
 *   unit=null ("all expected units absent") rather than silently skipped or
 *   fabricated. This deterministically distinguishes "no expected unit yet"
 *   from "scraper failed to write a row".
 *
 * Cadence is intentionally generous for government feeds so their normal
 * publishing schedules are not flagged as gaps:
 *   - DIT (กรมการค้าภายใน) publishes retail prices ~daily → 3-day slack.
 *   - EPPO (energy/fuel) revises ~weekly → 7-day slack.
 *   - Supermarket/wholesale scrapers run on cron (<=48h) → base 48h window.
 */
const SOURCE_CADENCE_HOURS: Record<string, number> = {
  DIT: 72,
  EPPO: 168,
  MAKRO: 48,
  LOTUSS: 48,
  SIMUMMUANG: 48,
};

/* ------------------------------------------------------------------ */
/* Pure classification + formatting (unit tested, no DB)               */
/* ------------------------------------------------------------------ */

export function classifyCoverage(
  mapping: MappedCoverage,
  recencyWindowHours: number,
  cadence: Record<string, number> = SOURCE_CADENCE_HOURS,
): CoverageStatus {
  const sourceSlug = mapping.source.slug.toUpperCase();
  const cadenceHours = cadence[sourceSlug] ?? recencyWindowHours;

  if (!mapping.latestPrice) {
    return {
      status: "MISSING",
      reason: "no historical price row for this mapping (all expected units absent)",
    };
  }

  const now = Date.now();
  const ageHours =
    (now - mapping.latestPrice.scrapedAt.getTime()) / (60 * 60 * 1000);

  if (ageHours <= cadenceHours) {
    return { status: "PRESENT", reason: `latest ${ageHours.toFixed(1)}h <= ${cadenceHours}h cutoff` };
  }

  return {
    status: "STALE",
    reason: `latest ${ageHours.toFixed(1)}h > ${cadenceHours}h cutoff`,
  };
}

/** Build a printable matrix row from a mapping + its classification. */
export function toCoverageRow(
  mapping: MappedCoverage,
  recencyWindowHours: number,
  cadence: Record<string, number> = SOURCE_CADENCE_HOURS,
): CoverageRow {
  const status = classifyCoverage(mapping, recencyWindowHours, cadence);
  return {
    productSlug: mapping.product.slug,
    source: mapping.source.slug,
    unit: mapping.unit,
    status: status.status,
    lastScraped: mapping.latestPrice?.scrapedAt ?? null,
    reason: status.reason,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function formatReport(
  rows: CoverageRow[],
  unmappedProducts: UnmappedProduct[],
): ReportResult {
  const sorted = [...rows].sort((a, b) => {
    if (a.productSlug !== b.productSlug) return a.productSlug < b.productSlug ? -1 : 1;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    const au = a.unit ?? "\u0000";
    const bu = b.unit ?? "\u0000";
    return au < bu ? -1 : au > bu ? 1 : 0;
  });

  const counts: ReportCounts = {
    mapped: sorted.length,
    present: sorted.filter((r) => r.status === "PRESENT").length,
    stale: sorted.filter((r) => r.status === "STALE").length,
    missing: sorted.filter((r) => r.status === "MISSING").length,
    unmapped: unmappedProducts.length,
  };

  const lines: string[] = [];
  lines.push(
    `mapped=${counts.mapped} present=${counts.present} stale=${counts.stale} missing=${counts.missing} unmapped=${counts.unmapped}`
  );
  lines.push(
    `${pad("productSlug", 24)}\t${pad("source", 12)}	${pad("unit", 14)}	status	lastScraped`
  );

  for (const r of sorted) {
    const last = r.lastScraped ? r.lastScraped.toISOString() : "—";
    lines.push(
      `${pad(r.productSlug, 24)}	${pad(r.source, 12)}	${pad(r.unit ?? "—", 14)}	${r.status}	${last}`
    );
  }

  if (unmappedProducts.length > 0) {
    lines.push("");
    lines.push(`UNMAPPED (${unmappedProducts.length}) — scraped rows with no product-source mapping:`);
    for (const u of unmappedProducts) {
      lines.push(
        `  ${u.source.slug}	${u.rawProductName}	${u.unit}	${u.scrapedAt.toISOString()}`
      );
    }
  }

  const unresolved = counts.missing + counts.stale;
  lines.push("");
  lines.push(
    `summary: mapped=${counts.mapped} present=${counts.present} stale=${counts.stale} missing=${counts.missing} unmapped=${counts.unmapped} -> ${unresolved === 0 ? "PASS" : "FAIL (unresolved gaps)"}`,
  );

  const exitCode: 0 | 1 = unresolved === 0 ? 0 : 1;
  return { report: lines.join("\n"), counts, exitCode };
}

/* ------------------------------------------------------------------ */
/* Raw query row shapes                                                */
/* ------------------------------------------------------------------ */

interface MappedQueryRow {
  product_id: number;
  product_slug: string;
  product_name_th: string;
  source_id: number;
  source_slug: string;
  unit: string | null;
  scraped_at: string | null;
  price: string | null;
}

interface UnmappedQueryRow {
  source_slug: string;
  product_name_th: string;
  unit: string;
  scraped_at: string;
  price: string;
}

/** Coerce a drizzle execute() result into a typed row array. */
function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybe = result as { rows?: T[] };
  if (Array.isArray(maybe.rows)) return maybe.rows;
  return [];
}

/* ------------------------------------------------------------------ */
/* Query builders (single grouped query, no N+1)                       */
/* ------------------------------------------------------------------ */

/**
 * One query: for every mapping, the latest price per (product, source, unit).
 * Uses DISTINCT ON so each (product, source, unit) collapses to its newest
 * row by scraped_at then source_date. Mappings with no price row survive the
 * LEFT JOIN with unit/scraped_at NULL → reported MISSING.
 */
function latestMappedSql(): string {
  return `\n    SELECT DISTINCT ON (psm.product_id, psm.source_id, COALESCE(latest.unit, ''))
      psm.product_id                              AS product_id,
      p.slug                                      AS product_slug,
      p.name_th                                   AS product_name_th,
      psm.source_id                               AS source_id,
      s.slug                                      AS source_slug,
      latest.unit                                 AS unit,
      latest.scraped_at                           AS scraped_at,
      latest.price                                AS price
    FROM product_source_mappings psm
    JOIN products p  ON p.id  = psm.product_id
    JOIN sources s   ON s.id  = psm.source_id
    LEFT JOIN LATERAL (
      SELECT pr.unit, pr.scraped_at, pr.price
      FROM prices pr
      WHERE pr.product_id = psm.product_id
        AND pr.source_id  = psm.source_id
      ORDER BY pr.unit, pr.scraped_at DESC, pr.source_date DESC
    ) latest ON true
    ORDER BY psm.product_id, psm.source_id, COALESCE(latest.unit, ''), latest.scraped_at DESC NULLS LAST
  `;
}

/**
 * One query: the latest scraped price rows whose (product, source) is NOT
 * present in product_source_mappings (orphaned / unmapped data).
 */
function latestUnmappedSql(): string {
  return `\n    SELECT DISTINCT ON (pr.product_id, pr.source_id, pr.unit)
      s.slug            AS source_slug,
      p.name_th         AS product_name_th,
      pr.unit           AS unit,
      pr.scraped_at     AS scraped_at,
      pr.price          AS price
    FROM prices pr
    JOIN products p  ON p.id = pr.product_id
    JOIN sources s   ON s.id = pr.source_id
    LEFT JOIN product_source_mappings psm
      ON psm.product_id = pr.product_id AND psm.source_id = pr.source_id
    WHERE psm.id IS NULL
    ORDER BY pr.product_id, pr.source_id, pr.unit, pr.scraped_at DESC, pr.source_date DESC
  `;
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                      */
/* ------------------------------------------------------------------ */

function parseRecencyHours(raw: string | undefined, fallback = 48): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
}

export async function runAudit(
  recencyWindowHours: number,
  json = false,
): Promise<ReportResult> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available (DATABASE_URL is not set)");
  }

  const mappedRaw = asRows<MappedQueryRow>(await db.execute(sql.raw(latestMappedSql())));
  const unmappedRaw = asRows<UnmappedQueryRow>(await db.execute(sql.raw(latestUnmappedSql())));

  const mappings: MappedCoverage[] = mappedRaw.map((r) => ({
    product: { id: r.product_id, slug: r.product_slug, nameTh: r.product_name_th },
    source: { id: r.source_id, slug: r.source_slug },
    unit: r.unit,
    latestPrice:
      r.scraped_at && r.price !== null
        ? { scrapedAt: new Date(r.scraped_at), price: r.price }
        : null,
  }));

  const rows = mappings.map((m) => toCoverageRow(m, recencyWindowHours));

  const unmapped: UnmappedProduct[] = unmappedRaw.map((u) => ({
    source: { slug: u.source_slug },
    rawProductName: u.product_name_th,
    unit: u.unit,
    scrapedAt: new Date(u.scraped_at),
  }));

  return formatReport(rows, unmapped);
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const recencyWindowHours = parseRecencyHours(process.env.RECENCY_WINDOW_HOURS);

  try {
    const result = await runAudit(recencyWindowHours, json);
    if (json) {
      console.log(
        JSON.stringify(
          { counts: result.counts, exitCode: result.exitCode, report: result.report },
          null,
          2,
        ),
      );
    } else {
      console.log(result.report);
    }
    process.exit(result.exitCode);
  } catch (err) {
    console.error("coverage-audit failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (isMainModule()) {
  void main();
}
