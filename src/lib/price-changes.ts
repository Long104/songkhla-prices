export interface PriceChange {
  changePct: number | null;
}

/**
 * Computes the % price change between the latest and previous report for each
 * (source, unit) pair. Rows must be ordered by source_date DESC, scraped_at DESC
 * (as returned by getAllPricesForProduct) so that within each key group the
 * first row is the latest report and the second is the previous one.
 *
 * changePct is rounded to 1 decimal place. Returns null when there is no
 * previous report or the previous price is 0 (avoid div-by-zero).
 */
export function computePriceChanges(
  rows: { sourceSlug: string; unit: string; price: string }[]
): Map<string, PriceChange> {
  const changes = new Map<string, PriceChange>();

  // Group consecutive rows by (sourceSlug, unit) preserving their order.
  const groups = new Map<string, { sourceSlug: string; unit: string; price: string }[]>();
  for (const row of rows) {
    const key = `${row.sourceSlug}::${row.unit}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  for (const [key, group] of groups) {
    const latest = Number(group[0].price);
    const previous = group.length > 1 ? Number(group[1].price) : null;

    if (previous === null || previous === 0) {
      changes.set(key, { changePct: null });
      continue;
    }

    const changePct = Math.round(((latest - previous) / previous) * 1000) / 10;
    changes.set(key, { changePct });
  }

  return changes;
}