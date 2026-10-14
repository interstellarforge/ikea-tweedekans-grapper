import type { Metadata } from "next";

import { ListsPage } from "@/features/lists/components/ListsPage.tsx";

export const metadata: Metadata = { title: "Lijsten · Tweedekanshoek" };

export default function Page() {
  return <ListsPage />;
}
