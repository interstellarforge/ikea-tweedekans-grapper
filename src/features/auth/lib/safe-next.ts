/** Only same-site paths are valid redirect targets after signing in. */
export function safeNext(next: string | undefined, fallback: string): string {
  if (next?.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}
