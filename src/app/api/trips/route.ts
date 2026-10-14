import { authed } from "@/server/api.ts";
import { bump } from "@/server/stats.ts";
import { computeTrips } from "@/server/trips.ts";

export const GET = authed(({ db, user }) => {
  bump(db, "trip_checks");
  return computeTrips(db, user.id);
});
