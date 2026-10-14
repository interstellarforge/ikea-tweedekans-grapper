import { z } from "zod";

import {
  clientIp,
  HttpError,
  newSessionCookie,
  open,
  reply,
} from "@/server/api.ts";
import { runtime } from "@/server/runtime.ts";
import { bump } from "@/server/stats.ts";
import { checkLogin, touchLogin } from "@/server/users.ts";

const bodySchema = z.object({ email: z.string(), password: z.string() });
const FAILURE_DELAY_MS = 600;

export const POST = open(async (request, db) => {
  const { limiter } = runtime();
  const ip = clientIp(request);
  if (limiter.isLocked(ip)) {
    throw new HttpError(
      429,
      "Te veel pogingen, probeer het over 15 minuten opnieuw",
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const user = parsed.success
    ? checkLogin(db, parsed.data.email, parsed.data.password)
    : undefined;
  if (!user) {
    limiter.recordFailure(ip);
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    throw new HttpError(401, "Onjuist e-mailadres of wachtwoord");
  }
  limiter.clear(ip);
  bump(db, "logins");
  touchLogin(db, user.id, Date.now());
  return reply({ ok: true }, 200, {
    "set-cookie": newSessionCookie(request, user),
  });
});
