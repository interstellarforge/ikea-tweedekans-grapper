import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthLayout } from "@/features/auth/components/AuthLayout.tsx";
import { LoginForm } from "@/features/auth/components/LoginForm.tsx";
import { safeNext } from "@/features/auth/lib/safe-next.ts";
import { getSessionUser } from "@/server/session.ts";

export const metadata: Metadata = { title: "Inloggen · Tweedekanshoek" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSessionUser()) redirect("/watchlist");
  const { next } = await searchParams;
  const target = safeNext(next, "");
  return (
    <AuthLayout>
      <LoginForm next={target || undefined} />
    </AuthLayout>
  );
}
