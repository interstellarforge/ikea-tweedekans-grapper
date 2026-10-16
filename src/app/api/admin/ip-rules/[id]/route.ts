import { authed, ok } from "@/server/api.ts";
import { deleteIpRule } from "@/server/ips.ts";

export const DELETE = authed(
  ({ db, params }) => {
    deleteIpRule(db, Number(params["id"]));
    return ok;
  },
  { admin: true },
);
