import type { Metadata } from "next";

import { OffersPage } from "@/features/offers/components/OffersPage.tsx";

export const metadata: Metadata = { title: "Aanbod · Tweedekanshoek" };

export default function Page() {
  return <OffersPage />;
}
