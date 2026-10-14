import { z } from "zod";

import { authed, HttpError, ok } from "@/server/api.ts";
import { deleteUser, updateUser } from "@/server/users.ts";

const bodySchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  active: z.boolean().optional(),
});

export const PUT = authed(
  async ({ db, user, params, body }) => {
    const id = Number(params["id"]);
    const changes = await body(bodySchema);
    if (id === user.id && changes.active === false) {
      throw new HttpError(400, "Je kunt jezelf niet deactiveren");
    }
    const error = updateUser(db, id, {
      ...(changes.role ? { role: changes.role } : {}),
      ...(changes.active === undefined ? {} : { active: changes.active }),
    });
    if (error) throw new HttpError(400, error);
    return ok;
  },
  { admin: true },
);

export const DELETE = authed(
  ({ db, user, params }) => {
    const id = Number(params["id"]);
    if (id === user.id) {
      throw new HttpError(400, "Je kunt jezelf niet verwijderen");
    }
    const error = deleteUser(db, id);
    if (error) throw new HttpError(400, error);
    return ok;
  },
  { admin: true },
);
