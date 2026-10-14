import { z } from "zod";

import { authed, HttpError } from "@/server/api.ts";
import { deliver } from "@/server/notify.ts";

const MAPS_PREFIX = "https://www.google.com/maps/dir/";
const MAX_TITLE = 120;
const bodySchema = z.object({
  url: z.string().default(""),
  title: z.string().default(""),
});

// Sends a map link to the user's own active notification channels (their phone).
export const POST = authed(async ({ db, user, body }) => {
  const { url, title } = await body(bodySchema);
  if (!url.startsWith(MAPS_PREFIX))
    throw new HttpError(400, "Ongeldige kaartlink");
  let summary: string;
  try {
    summary = await deliver(db, user, {
      title: `Tweedekanshoek: ${title.slice(0, MAX_TITLE) || "Route"}`,
      body: "Tik om de route op de kaart te openen.",
      links: { click: url, actions: [] },
    });
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "versturen mislukt",
    );
  }
  if (summary === "geen kanaal actief") {
    throw new HttpError(
      400,
      "Geen meldingskanaal actief. Zet er een aan bij Instellingen → Meldingen.",
    );
  }
  if (!summary.includes(": ok")) {
    throw new HttpError(400, `Versturen mislukt (${summary})`);
  }
  return { ok: true, summary };
});
