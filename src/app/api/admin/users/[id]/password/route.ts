import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { getUserById, setPassword } from "@/server/users.ts";

const bodySchema = z.object({ password: z.string() });
const MIN_PASSWORD = 8;

export const POST = authed(
  async ({ db, params, body }) => {
    const id = Number(params["id"]);
    const { password } = await body(bodySchema);
    if (password.length < MIN_PASSWORD) {
      throw new HttpError(400, "Wachtwoord: minimaal 8 tekens");
    }
    if (!getUserById(db, id))
      throw new HttpError(404, "Gebruiker niet gevonden");
    setPassword(db, id, password);
    return ok;
  },
  { admin: true },
);
