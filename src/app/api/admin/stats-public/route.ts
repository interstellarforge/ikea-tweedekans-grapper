import { z } from "zod";

import { authed } from "@/server/api.ts";
import { savePublicStatsConfig } from "@/server/stats.ts";

const bodySchema = z.object({
  enabled: z.boolean().default(false),
  keys: z.array(z.string()).default([]),
});

export const PUT = authed(
  async ({ db, body }) => savePublicStatsConfig(db, await body(bodySchema)),
  { admin: true },
);
