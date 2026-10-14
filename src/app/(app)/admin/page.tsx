import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminPage } from "@/features/admin/components/AdminPage.tsx";
import { getSessionUser } from "@/server/session.ts";

export const metadata: Metadata = { title: "Beheer · Tweedekanshoek" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/watchlist");
  return <AdminPage currentUserId={user.id} />;
}
