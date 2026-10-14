import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import { COUNTRY_CODES } from "@/server/countries.ts";
import type { Db } from "@/server/db.ts";
import { channelStatus, ntfyUrlFor } from "@/server/notify.ts";
import {
  getUserSettings,
  saveUserSettings,
  toPublicUser,
  type UserSettingsInput,
} from "@/server/settings.ts";
import type { User } from "@/server/users.ts";

const bodySchema = z.object({
  countries: z.array(z.string()).optional(),
  homePostcode: z.string().optional(),
  maxStops: z.number().optional(),
  maxTripMinutes: z.number().optional(),
  hourlyRate: z.number().optional(),
  stopMinutes: z.number().optional(),
  fuelPrice: z.number().optional(),
  consumptionPer100km: z.number().optional(),
  routeAllStores: z.boolean().optional(),
  notify: z
    .object({
      ntfy: z.boolean().optional(),
      email: z.boolean().optional(),
      homeAssistant: z.boolean().optional(),
    })
    .optional(),
  homeAssistant: z
    .object({
      baseUrl: z.string().optional(),
      token: z.string().optional(),
      targets: z.array(z.string()).optional(),
    })
    .optional(),
});

const view = (db: Db, user: User) => ({
  ...toPublicUser(getUserSettings(db, user.id)),
  channels: channelStatus(db, user),
  ntfyUrl: ntfyUrlFor(user) ?? "",
  email: user.email,
});

export const GET = authed(({ db, user }) => view(db, user));

export const PUT = authed(async ({ db, user, body }) => {
  const parsed = await body(bodySchema);
  const input = JSON.parse(JSON.stringify(parsed)) as UserSettingsInput;
  if (parsed.countries) {
    input.countries = parsed.countries.filter((c) =>
      (COUNTRY_CODES as readonly string[]).includes(c),
    );
  }
  const error = saveUserSettings(db, user.id, input);
  if (error) throw new HttpError(400, error);
  return view(db, user);
});
