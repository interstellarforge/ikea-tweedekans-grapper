import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Landing } from "@/features/landing/components/Landing.tsx";
import { runtime } from "@/server/runtime.ts";
import { getSessionUser } from "@/server/session.ts";
import { publicStats } from "@/server/stats.ts";

export const metadata: Metadata = {
  title: "Tweedekanshoek · weet wanneer het er ligt",
  description:
    "Weet wanneer jouw IKEA-producten in de tweedekanshoek liggen en of de rit ernaartoe loont. Onofficieel hulpmiddel voor Nederland, België en Duitsland.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await getSessionUser()) redirect("/watchlist");
  return <Landing stats={publicStats(runtime().db)} />;
}
