import { authed } from "@/server/api.ts";
import { listUsers } from "@/server/users.ts";

export const GET = authed(
  ({ db }) =>
    listUsers(db).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    })),
  { admin: true },
);
