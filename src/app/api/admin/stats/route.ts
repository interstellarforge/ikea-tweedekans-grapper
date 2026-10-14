import { authed } from "@/server/api.ts";
import { computeStats, getPublicStatsConfig } from "@/server/stats.ts";

export const GET = authed(
  ({ db }) => ({ stats: computeStats(db), public: getPublicStatsConfig(db) }),
  { admin: true },
);
