import { z } from "zod";

import { setAdminAlertsEnabled } from "@/server/admin-alerts.ts";
import { authed, ok } from "@/server/api.ts";
import { clientIp, listIpRules } from "@/server/ips.ts";
import {
  computeTraffic,
  purgeAccessLog,
  setRetentionDays,
} from "@/server/stats.ts";

const bodySchema = z.object({
  retentionDays: z.number().optional(),
  alertsEnabled: z.boolean().optional(),
});

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
    const changes = await body(bodySchema);
    if (changes.alertsEnabled !== undefined) {
      setAdminAlertsEnabled(db, changes.alertsEnabled);
    }
    if (changes.retentionDays !== undefined) {
      setRetentionDays(db, changes.retentionDays);
      purgeAccessLog(db);
    }
    return ok;
  },
  { admin: true },
);
