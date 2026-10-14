import { authed } from "@/server/api.ts";

export const GET = authed(({ user }) => ({
  id: user.id,
  email: user.email,
  username: user.email,
  role: user.role,
}));
