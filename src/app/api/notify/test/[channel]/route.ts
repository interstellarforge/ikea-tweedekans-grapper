import { authed, HttpError, ok } from "@/server/api.ts";
import { type ChannelName, deliver, testContent } from "@/server/notify.ts";

const CHANNELS: Record<string, ChannelName> = {
  ntfy: "ntfy",
  email: "email",
  ha: "homeAssistant",
};

export const POST = authed(async ({ db, user, ctx, params }) => {
  const channel = CHANNELS[params["channel"] ?? ""];
  if (!channel) throw new HttpError(404, "Onbekend meldingstype");
  try {
    await deliver(
      db,
      user,
      testContent(db, ctx, "Testmelding van Tweedekanshoek."),
      channel,
    );
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "versturen mislukt",
    );
  }
  return ok;
});
