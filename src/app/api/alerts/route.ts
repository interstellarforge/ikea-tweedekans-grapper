import { authed } from "@/server/api.ts";
import { listAlerts } from "@/server/watchlist.ts";

const number = (v: string | null): number | undefined =>
  v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;

export const GET = authed(({ db, user, url }) =>
  listAlerts(
    db,
    user.id,
    number(url.searchParams.get("limit")),
    number(url.searchParams.get("offset")),
  ),
);
