import { z } from "zod";

import { authed } from "@/server/api.ts";
import { clientIp, listIpRules } from "@/server/ips.ts";
import {
  computeTraffic,
  purgeAccessLog,
  setRetentionDays,
} from "@/server/stats.ts";

const bodySchema = z.object({ retentionDays: z.number() });

export const GET = authed(
  ({ db, request }) => ({
    traffic: computeTraffic(db),
    rules: listIpRules(db),
    yourIp: clientIp(request),
  }),
  { admin: true },
);

export const PUT = authed(
  async ({ db, body }) => {
    const retentionDays = setRetentionDays(
      db,
      (await body(bodySchema)).retentionDays,
    );
    purgeAccessLog(db);
    return { retentionDays };
  },
  { admin: true },
);
