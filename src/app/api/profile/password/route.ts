import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { checkLogin, setPassword } from "@/server/users.ts";

const bodySchema = z.object({ current: z.string(), next: z.string() });
const MIN_PASSWORD = 8;

export const PUT = authed(async ({ db, user, body, startSession }) => {
  const { current, next } = await body(bodySchema);
  if (!checkLogin(db, user.email, current)) {
    throw new HttpError(400, "Huidig wachtwoord klopt niet");
  }
  if (next.length < MIN_PASSWORD) {
    throw new HttpError(400, "Nieuw wachtwoord: minimaal 8 tekens");
  }
  setPassword(db, user.id, next);
  // The session is bound to the password: hand this browser a fresh one.
  startSession();
  return ok;
});
