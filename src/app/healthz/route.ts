import { reply } from "@/server/api.ts";

export function GET(): Response {
  return reply({ ok: true });
}
