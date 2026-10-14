import { authed, HttpError, ok } from "@/server/api.ts";
import { sendEmail } from "@/server/notify.ts";
import { getGlobalSettings } from "@/server/settings.ts";

export const POST = authed(
  async ({ db, user }) => {
    try {
      await sendEmail(
        getGlobalSettings(db).smtp,
        user.email,
        "Tweedekanshoek: SMTP-test",
        "De SMTP-instellingen werken.",
      );
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "versturen mislukt",
      );
    }
    return ok;
  },
  { admin: true },
);
