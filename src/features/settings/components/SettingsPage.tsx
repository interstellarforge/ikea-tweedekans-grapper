"use client";

import "../settings.css";

import { useCallback, useEffect, useState } from "react";

import { useHashTab } from "@/hooks/useHashTab.ts";
import { api, errorMessage, send } from "@/lib/api-client.ts";
import type { StoreRow } from "@/server/db.ts";
import type { ChannelName } from "@/server/notify.ts";
import type { PublicUserSettings } from "@/server/settings.ts";

import { NotificationsTab } from "./NotificationsTab.tsx";
import { StoresTab } from "./StoresTab.tsx";
import { TripTab } from "./TripTab.tsx";

export type ChannelState = {
  visible: boolean;
  enabled: boolean;
  configured: boolean;
};

export type SettingsView = PublicUserSettings & {
  channels: Record<ChannelName, ChannelState>;
  ntfyUrl: string;
  email: string;
};

export type SettingsDraft = {
  homePostcode: string;
  fuelPrice: string;
  consumptionPer100km: string;
  maxStops: string;
  stopMinutes: string;
  hourlyRate: string;
  maxTripMinutes: string;
  routeAllStores: boolean;
  notify: { ntfy: boolean; email: boolean; homeAssistant: boolean };
  haUrl: string;
  haToken: string;
  haTargets: string[];
};

const TABS = ["filialen", "ritje", "meldingen"] as const;

const toDraft = (s: SettingsView): SettingsDraft => ({
  homePostcode: s.homePostcode,
  fuelPrice: String(s.fuelPrice),
  consumptionPer100km: String(s.consumptionPer100km),
  maxStops: String(s.maxStops),
  stopMinutes: String(s.stopMinutes),
  hourlyRate: String(s.hourlyRate),
  maxTripMinutes: String(s.maxTripMinutes),
  routeAllStores: s.routeAllStores,
  notify: { ...s.notify },
  haUrl: s.homeAssistant.baseUrl,
  haToken: "",
  haTargets: s.homeAssistant.targets,
});

const toPayload = (d: SettingsDraft) => ({
  homePostcode: d.homePostcode,
  fuelPrice: Number(d.fuelPrice),
  consumptionPer100km: Number(d.consumptionPer100km),
  maxStops: Number(d.maxStops),
  stopMinutes: Number(d.stopMinutes),
  hourlyRate: Number(d.hourlyRate),
  maxTripMinutes: Number(d.maxTripMinutes),
  routeAllStores: d.routeAllStores,
  notify: d.notify,
  homeAssistant: {
    baseUrl: d.haUrl,
    token: d.haToken,
    targets: d.haTargets,
  },
});

export function SettingsPage() {
  const tab = useHashTab(TABS, "filialen");
  const [settings, setSettings] = useState<SettingsView | undefined>(undefined);
  const [draft, setDraft] = useState<SettingsDraft | undefined>(undefined);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    error: boolean;
  }>({ text: "", error: false });

  const apply = useCallback((next: SettingsView) => {
    setSettings(next);
    setDraft(toDraft(next));
  }, []);

  const loadStores = useCallback(async () => {
    setStores(await api<StoreRow[]>("/api/stores"));
  }, []);

  useEffect(() => {
    void api<SettingsView>("/api/settings").then(apply);
    void loadStores();
  }, [apply, loadStores]);

  const patch = (changes: Partial<SettingsDraft>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  };

  /** Saves the draft; used by the save button and by the test buttons. */
  const save = async (): Promise<void> => {
    if (!draft) return;
    apply(await send<SettingsView>("/api/settings", "PUT", toPayload(draft)));
  };

  const saveClicked = async () => {
    try {
      await save();
      setSaveMessage({ text: "Opgeslagen", error: false });
    } catch (error) {
      setSaveMessage({ text: errorMessage(error), error: true });
    }
  };

  const setCountries = async (countries: string[]) => {
    apply(await send<SettingsView>("/api/settings", "PUT", { countries }));
    await loadStores();
  };

  if (!settings || !draft) {
    return (
      <main className="settings-page">
        <h1>Instellingen</h1>
      </main>
    );
  }

  return (
    <main className="settings-page">
      <h1>Instellingen</h1>
      <nav className="tabs">
        <a href="#filialen" className={tab === "filialen" ? "active" : ""}>
          Filialen
        </a>
        <a href="#ritje" className={tab === "ritje" ? "active" : ""}>
          Ritje-check
        </a>
        <a href="#meldingen" className={tab === "meldingen" ? "active" : ""}>
          Meldingen
        </a>
      </nav>

      {tab === "filialen" ? (
        <StoresTab
          stores={stores}
          countries={settings.countries}
          onCountries={setCountries}
        />
      ) : null}
      {tab === "ritje" ? (
        <TripTab draft={draft} patch={patch} stores={stores} />
      ) : null}
      {tab === "meldingen" ? (
        <NotificationsTab
          settings={settings}
          draft={draft}
          patch={patch}
          save={save}
        />
      ) : null}

      {tab === "filialen" ? null : (
        <div className="row">
          <button type="button" onClick={() => void saveClicked()}>
            Instellingen opslaan
          </button>
          <span className={saveMessage.error ? "err" : "hint"}>
            {saveMessage.text}
          </span>
        </div>
      )}
    </main>
  );
}
