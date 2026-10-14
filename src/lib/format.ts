const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 1440;

const COUNTRY_PATH: Record<string, string> = {
  nl: "nl/nl",
  be: "be/nl",
  de: "de/de",
};

export const OFFERS_URL =
  "https://www.ikea.com/nl/nl/second-hand/buy-from-ikea/";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function money(value: number, currency = "EUR"): string {
  return currency === "EUR"
    ? euro.format(value)
    : new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(
        value,
      );
}

/** "€2,50" without the space, for compact chips. */
export const moneyTight = (value: number, currency = "EUR"): string =>
  money(value, currency).replace(/\s/g, "");

export function ago(ms: number | undefined | null, now = Date.now()): string {
  if (!ms) return "nooit";
  const minutes = Math.round((now - ms) / MINUTE_MS);
  if (minutes < 1) return "zojuist";
  if (minutes < HOUR_MINUTES) return `${String(minutes)} min geleden`;
  if (minutes < DAY_MINUTES) {
    return `${String(Math.round(minutes / HOUR_MINUTES))} uur geleden`;
  }
  return `${String(Math.round(minutes / DAY_MINUTES))} d geleden`;
}

/** 135 -> "2u 15m", 40 -> "40 min". */
export function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < HOUR_MINUTES) return `${String(m)} min`;
  const hours = Math.floor(m / HOUR_MINUTES);
  const rest = m % HOUR_MINUTES;
  return rest ? `${String(hours)}u ${String(rest)}m` : `${String(hours)}u`;
}

/** " (BE)" for stores outside the Netherlands, so duplicate-looking names stay clear. */
export const countryTag = (country: string | undefined): string =>
  !country || country === "nl" ? "" : ` (${country.toUpperCase()})`;

/** Deep link to one offer on IKEA's tweedekanshoek page. */
export function ikeaOfferUrl(
  storeName: string,
  offerNumber: string,
  country = "nl",
): string {
  const slug = storeName
    .toLowerCase()
    .replace(/ikea /g, "")
    .trim()
    .replace(/\//g, "")
    .replace(/-/g, "")
    .replace(/\s+/g, "+");
  const path = COUNTRY_PATH[country] ?? "nl/nl";
  return `https://www.ikea.com/${path}/second-hand/buy-from-ikea/#/${slug}/${offerNumber}`;
}

export const dateTime = (ms: number | undefined): string =>
  ms
    ? new Date(ms).toLocaleString("nl-NL", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "–";
