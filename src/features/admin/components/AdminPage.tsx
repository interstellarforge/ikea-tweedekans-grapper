"use client";

import "../admin.css";

import { useHashTab } from "@/hooks/useHashTab.ts";

import { FetchTab } from "./FetchTab.tsx";
import { NotificationTypesTab } from "./NotificationTypesTab.tsx";
import { StatsTab } from "./StatsTab.tsx";
import { TrafficTab } from "./TrafficTab.tsx";
import { UsersTab } from "./UsersTab.tsx";

const TABS = [
  "statistieken",
  "verkeer",
  "gebruikers",
  "meldingen",
  "ophalen",
] as const;

const LABELS: Record<(typeof TABS)[number], string> = {
  statistieken: "Statistieken",
  verkeer: "Verkeer & IP's",
  gebruikers: "Gebruikers",
  meldingen: "Meldingstypes",
  ophalen: "Ophalen & status",
};

export function AdminPage({ currentUserId }: { currentUserId: number }) {
  const tab = useHashTab(TABS, "statistieken");
  return (
    <main className="admin-page">
      <h1>Beheer</h1>
      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t} href={`#${t}`} className={tab === t ? "active" : ""}>
            {LABELS[t]}
          </a>
        ))}
      </nav>
      {tab === "statistieken" ? <StatsTab /> : null}
      {tab === "verkeer" ? <TrafficTab /> : null}
      {tab === "gebruikers" ? <UsersTab currentUserId={currentUserId} /> : null}
      {tab === "meldingen" ? <NotificationTypesTab /> : null}
      {tab === "ophalen" ? <FetchTab /> : null}
    </main>
  );
}
