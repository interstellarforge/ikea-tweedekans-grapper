import { authed } from "@/server/api.ts";
import { listStores } from "@/server/db.ts";
import { pollStatus } from "@/server/poller.ts";

export const GET = authed(
  ({ db }) => ({ ...pollStatus, stores: listStores(db) }),
  { admin: true },
);
