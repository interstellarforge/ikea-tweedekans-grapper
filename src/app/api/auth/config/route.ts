import { open } from "@/server/api.ts";
import { getGlobalSettings } from "@/server/settings.ts";
import { countUsers } from "@/server/users.ts";

export const GET = open((_request, db) => {
  const first = countUsers(db) === 0;
  return {
    registrationOpen: first || getGlobalSettings(db).registrationOpen,
    firstAccount: first,
  };
});
