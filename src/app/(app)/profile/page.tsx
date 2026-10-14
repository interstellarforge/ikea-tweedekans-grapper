import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfilePage } from "@/features/profile/components/ProfilePage.tsx";
import { getSessionUser } from "@/server/session.ts";

export const metadata: Metadata = { title: "Profiel · Tweedekanshoek" };

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ProfilePage email={user.email} />;
}
