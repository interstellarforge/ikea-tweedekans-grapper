import { authed, reply } from "@/server/api.ts";
import { pollAll } from "@/server/poller.ts";

export const POST = authed(
  ({ db }) => {
    void pollAll(db);
    return reply({ running: true }, 202);
  },
  { admin: true },
);
