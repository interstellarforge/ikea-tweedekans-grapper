import { z } from "zod";

import { authed, clientIp, HttpError } from "@/server/api.ts";
import { addIpRule, IpRuleError } from "@/server/ips.ts";

const bodySchema = z.object({
  cidr: z.string(),
  kind: z.enum(["allow", "block"]),
  note: z.string().max(200).default(""),
  expiresAt: z.number().optional(),
});

export const POST = authed(
  async ({ db, body, request }) => {
    try {
      return addIpRule(db, await body(bodySchema), clientIp(request));
    } catch (error) {
      if (error instanceof IpRuleError) throw new HttpError(400, error.message);
      throw error;
    }
  },
  { admin: true },
);
