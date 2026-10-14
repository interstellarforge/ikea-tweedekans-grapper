import { open, reply, sessionCookie } from "@/server/api.ts";

export const POST = open((request) =>
  reply({ ok: true }, 200, { "set-cookie": sessionCookie(request, "", 0) }),
);
