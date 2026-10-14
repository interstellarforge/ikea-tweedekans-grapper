import type { Metadata } from "next";

import { SettingsPage } from "@/features/settings/components/SettingsPage.tsx";

export const metadata: Metadata = { title: "Instellingen · Tweedekanshoek" };

export default function Page() {
  return <SettingsPage />;
}
