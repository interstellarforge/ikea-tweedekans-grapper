export type ParsedItem = { articleNumber: string; quantity: number };

// 8 digits, optionally written as 802.045.62 / 802 045 62 / 802-045-62
const ARTICLE_RE = /(?<!\d)(\d{3}[.\s-]?\d{3}[.\s-]?\d{2}|\d{8})(?!\d)/;

function quantityIn(rest: string): number {
  const patterns = [
    /(\d{1,3})\s*[x×]\b/i, // 2x
    /\b[x×]\s*(\d{1,3})\b/i, // x2
    /(\d{1,3})\s*(?:stuks?|st\.?|pcs|keer)\b/i, // 2 stuks
    /\b(?:aantal|qty|stuks)[:\s]+(\d{1,3})\b/i, // aantal: 2
  ];
  for (const re of patterns) {
    const m = re.exec(rest);
    const n = Number(m?.[1]);
    if (n >= 1) return Math.min(n, 99);
  }
  return 1;
}

/**
 * Extracts article numbers (and optional quantities) from pasted text, one item per line.
 * Duplicate articles are summed. Lines without an article number are ignored.
 */
export function parseShoppingList(text: string): ParsedItem[] {
  const items = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const match = ARTICLE_RE.exec(line);
    if (!match?.[1]) continue;
    const articleNumber = match[1].replace(/\D/g, "");
    const rest = line.replace(match[0], " ");
    items.set(
      articleNumber,
      Math.min((items.get(articleNumber) ?? 0) + quantityIn(rest), 99),
    );
  }
  return [...items].map(([articleNumber, quantity]) => ({
    articleNumber,
    quantity,
  }));
}
