import type { Metadata } from "next";

import { CatalogPage } from "@/features/catalog/components/CatalogPage.tsx";

export const metadata: Metadata = {
  title: "Zoeken in producten · Tweedekanshoek",
};

export default function Page() {
  return <CatalogPage />;
}
