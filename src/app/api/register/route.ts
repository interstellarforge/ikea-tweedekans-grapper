import { z } from "zod";

import {
  clientIp,
  HttpError,
  newSessionCookie,
  open,
  reply,
} from "@/server/api.ts";
import { config } from "@/server/config.ts";
import { runtime } from "@/server/runtime.ts";
import { getGlobalSettings } from "@/server/settings.ts";
import {
  countUsers,
  createUser,
  isValidEmail,
  normalizeEmail,
  touchLogin,
} from "@/server/users.ts";

const bodySchema = z.object({ email: z.string(), password: z.string() });
const MIN_PASSWORD = 8;

export const POST = open(async (request, db) => {
  const { limiter } = runtime();
  const ip = clientIp(request);
  if (limiter.isLocked(ip)) {
    throw new HttpError(429, "Te veel pogingen, probeer het later opnieuw");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const email = normalizeEmail(parsed.success ? parsed.data.email : "");
  const password = parsed.success ? parsed.data.password : "";
  const first = countUsers(db) === 0;
  if (!first && !getGlobalSettings(db).registrationOpen) {
    throw new HttpError(403, "Registreren is uitgeschakeld");
  }
  if (first && config.adminEmail && email !== config.adminEmail) {
    throw new HttpError(
      403,
      "Het eerste account moet het beheerders-e-mailadres zijn",
    );
  }
  if (!isValidEmail(email)) {
    throw new HttpError(400, "Vul een geldig e-mailadres in");
  }
  if (password.length < MIN_PASSWORD) {
    throw new HttpError(400, "Wachtwoord: minimaal 8 tekens");
  }
  try {
    const created = createUser(db, { email, password });
    touchLogin(db, created.id, Date.now());
    return reply({ ok: true }, 200, {
      "set-cookie": newSessionCookie(request, created),
    });
  } catch (error) {
    limiter.recordFailure(ip);
    const exists = error instanceof Error && /UNIQUE/i.test(error.message);
    throw new HttpError(
      exists ? 409 : 500,
      exists ? "Dit e-mailadres is al in gebruik" : "Account maken mislukt",
    );
  }
});
