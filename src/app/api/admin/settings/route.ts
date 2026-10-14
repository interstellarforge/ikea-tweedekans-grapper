import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import {
  getGlobalSettings,
  saveGlobalSettings,
  toPublicGlobal,
} from "@/server/settings.ts";

const bodySchema = z.object({
  pollIntervalMin: z.number().optional(),
  registrationOpen: z.boolean().optional(),
  channels: z
    .object({
      ntfy: z.boolean().optional(),
      email: z.boolean().optional(),
      homeAssistant: z.boolean().optional(),
    })
    .optional(),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().optional(),
      secure: z.boolean().optional(),
      user: z.string().optional(),
      password: z.string().optional(),
      from: z.string().optional(),
    })
    .optional(),
});

export const GET = authed(({ db }) => toPublicGlobal(getGlobalSettings(db)), {
  admin: true,
});

export const PUT = authed(
  async ({ db, body }) => {
    const input = await body(bodySchema);
    // zod yields explicit `undefined` keys; drop them for exactOptionalPropertyTypes.
    const clean = JSON.parse(JSON.stringify(input)) as Parameters<
      typeof saveGlobalSettings
    >[1];
    const error = saveGlobalSettings(db, clean);
    if (error) throw new HttpError(400, error);
    return toPublicGlobal(getGlobalSettings(db));
  },
  { admin: true },
);
