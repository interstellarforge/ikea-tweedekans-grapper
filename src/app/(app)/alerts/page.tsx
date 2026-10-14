import type { Metadata } from "next";

import { AlertsPage } from "@/features/alerts/components/AlertsPage.tsx";

export const metadata: Metadata = { title: "Meldingen · Tweedekanshoek" };

export default function Page() {
  return <AlertsPage />;
}
