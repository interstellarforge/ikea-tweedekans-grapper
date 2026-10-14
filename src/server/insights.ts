export type PriceTag = {
  kind: "lowest" | "equal" | "pricier";
  /** Positive amount above the lowest earlier measured price (0 unless pricier). */
  diff: number;
  /** Lowest price measured earlier for this article (other offers). */
  low: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Compares an offer price with the lowest price measured earlier for the same article.
 * Returns undefined when there is no earlier measurement.
 */
export function priceTag(
  price: number,
  priorLow: number | null | undefined,
): PriceTag | undefined {
  if (priorLow === null || priorLow === undefined) return undefined;
  const diff = round2(price - priorLow);
  if (diff < 0) return { kind: "lowest", diff: 0, low: priorLow };
  if (diff === 0) return { kind: "equal", diff: 0, low: priorLow };
  return { kind: "pricier", diff, low: priorLow };
}
