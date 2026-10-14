import type { Metadata } from "next";

import { TripsPage } from "@/features/trips/components/TripsPage.tsx";

export const metadata: Metadata = { title: "Ritje-check · Tweedekanshoek" };

export default function Page() {
  return <TripsPage />;
}
