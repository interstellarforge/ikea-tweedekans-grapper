import { authed } from "@/server/api.ts";
import { COUNTRY_CODES } from "@/server/countries.ts";
import { listStores, upsertStores } from "@/server/db.ts";
import { fetchStores } from "@/server/ikea-client.ts";

export const GET = authed(async ({ db, ctx }) => {
  if (listStores(db).length === 0) {
    for (const country of COUNTRY_CODES) {
      try {
        upsertStores(db, await fetchStores(country), country);
      } catch (error) {
        console.error(`[stores] list (${country}) failed:`, error);
      }
    }
  }
  return listStores(db, ctx);
});
