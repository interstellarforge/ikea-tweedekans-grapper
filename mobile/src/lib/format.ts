const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 1440;

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export const money = (value: number): string => euro.format(value);

export function ago(ms: number | undefined, now = Date.now()): string {
  if (!ms) return "nooit";
  const minutes = Math.round((now - ms) / MINUTE_MS);
  if (minutes < 1) return "zojuist";
  if (minutes < HOUR_MINUTES) return `${String(minutes)} min geleden`;
  if (minutes < DAY_MINUTES) {
    return `${String(Math.round(minutes / HOUR_MINUTES))} uur geleden`;
  }
  return `${String(Math.round(minutes / DAY_MINUTES))} d geleden`;
}

export function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < HOUR_MINUTES) return `${String(m)} min`;
  const hours = Math.floor(m / HOUR_MINUTES);
  const rest = m % HOUR_MINUTES;
  return rest ? `${String(hours)}u ${String(rest)}m` : `${String(hours)}u`;
}

export const countryTag = (country: string | undefined): string =>
  !country || country === "nl" ? "" : ` (${country.toUpperCase()})`;
