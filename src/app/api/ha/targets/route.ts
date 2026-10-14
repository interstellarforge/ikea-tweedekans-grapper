import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import { listHaNotifyTargets } from "@/server/notify.ts";

const bodySchema = z.object({
  baseUrl: z.string().default(""),
  token: z.string().default(""),
});

export const POST = authed(async ({ settings, body }) => {
  const input = await body(bodySchema);
  const stored = settings.homeAssistant;
  const baseUrl = (input.baseUrl || stored.baseUrl).replace(/\/+$/, "");
  const token = input.token || stored.token;
  try {
    return { targets: await listHaNotifyTargets(baseUrl, token) };
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error
        ? error.message
        : "Verbinding met Home Assistant mislukt",
    );
  }
});
