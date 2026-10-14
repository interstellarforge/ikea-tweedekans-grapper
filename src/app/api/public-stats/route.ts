import { open } from "@/server/api.ts";
import { publicStats } from "@/server/stats.ts";

export const GET = open((_request, db) => publicStats(db));
