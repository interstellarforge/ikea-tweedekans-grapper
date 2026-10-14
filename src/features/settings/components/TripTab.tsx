"use client";

import { send } from "@/lib/api-client.ts";
import type { StoreRow } from "@/server/db.ts";

import type { SettingsDraft } from "./SettingsPage.tsx";
import { StoresByCountry } from "./StoresTab.tsx";

const MAX_STOPS_WARNING = 4;

type StringField =
  | "fuelPrice"
  | "maxStops"
  | "stopMinutes"
  | "maxTripMinutes"
  | "hourlyRate"
  | "consumptionPer100km";

type NumberField = {
  key: StringField;
  label: string;
  min: string;
  max: string;
  step: string;
  inputMode: "decimal" | "numeric";
};

const FIELDS: NumberField[] = [
  {
    key: "fuelPrice",
    label: "Benzineprijs (€ per liter)",
    min: "0.5",
    max: "5",
    step: "0.01",
    inputMode: "decimal",
  },
  {
    key: "maxStops",
    label: "Max. aantal stops (filialen) per rit",
    min: "1",
    max: "8",
    step: "1",
    inputMode: "numeric",
  },
  {
    key: "stopMinutes",
    label: "Tijd per filiaal (minuten ophalen)",
    min: "0",
    max: "240",
    step: "5",
    inputMode: "numeric",
  },
  {
    key: "maxTripMinutes",
    label: "Max. tijd per rit (minuten)",
    min: "0",
    max: "1440",
    step: "5",
    inputMode: "numeric",
  },
  {
    key: "hourlyRate",
    label: "Waarde van je tijd (€ per uur)",
    min: "0",
    max: "500",
    step: "1",
    inputMode: "numeric",
  },
  {
    key: "consumptionPer100km",
    label: "Verbruik (liter per 100 km)",
    min: "1",
    max: "40",
    step: "0.1",
    inputMode: "decimal",
  },
];

const HINTS: Partial<Record<StringField, string>> = {
  maxTripMinutes:
    "Routes en ritten die langer duren (rijden + tijd in de winkels) worden niet voorgesteld. 0 = geen limiet.",
  hourlyRate:
    "Wordt van het nettovoordeel afgetrokken (rijden + tijd in de winkel). Is een rit wel in geld rendabel maar niet meer na tijdkosten, dan wordt hij oranje getoond. 0 = tijd negeren.",
};

export function TripTab({
  draft,
  patch,
  stores,
}: {
  draft: SettingsDraft;
  patch: (changes: Partial<SettingsDraft>) => void;
  stores: StoreRow[];
}) {
  return (
    <div>
      <details className="channel" open>
        <summary>Ritje-check</summary>
        <div className="body">
          <p className="hint">
            Hiermee berekent de app per filiaal of een rit de moeite waard is:
            besparing op wat je nog nodig hebt (boodschappenlijsten) minus
            brandstofkosten en eventueel tijd.
          </p>
          <div className="field">
            <label htmlFor="postcode">Postcode</label>
            <input
              type="text"
              id="postcode"
              placeholder="1234 AB"
              autoComplete="postal-code"
              value={draft.homePostcode}
              onChange={(event) => {
                patch({ homePostcode: event.target.value });
              }}
            />
          </div>
          {FIELDS.map((f) => {
            const hint = HINTS[f.key];
            return (
              <div key={f.key}>
                <div className="field">
                  <label htmlFor={f.key}>{f.label}</label>
                  <input
                    type="number"
                    id={f.key}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    inputMode={f.inputMode}
                    value={draft[f.key]}
                    onChange={(event) => {
                      patch({ [f.key]: event.target.value });
                    }}
                  />
                </div>
                {f.key === "maxStops" &&
                Number(draft.maxStops) > MAX_STOPS_WARNING ? (
                  <p className="warn">
                    Let op: bij meer dan 4 stops wordt de volgorde met een
                    snelle benadering bepaald (niet gegarandeerd de kortste),
                    het rekenen duurt langer, en zo&apos;n rit kost in de
                    praktijk veel tijd.
                  </p>
                ) : null}
                {hint ? <p className="hint">{hint}</p> : null}
              </div>
            );
          })}
          <div className="field">
            <label htmlFor="routeAll">Routes langs filialen</label>
            <span>
              <input
                type="checkbox"
                id="routeAll"
                checked={draft.routeAllStores}
                onChange={(event) => {
                  patch({ routeAllStores: event.target.checked });
                }}
              />
              <label htmlFor="routeAll">
                Routes mogen langs alle (niet-uitgesloten) filialen gaan
              </label>
            </span>
          </div>
          <p className="hint">
            Uitgevinkt: routes gebruiken alleen filialen die je volgt.
          </p>
        </div>
      </details>
      <details className="channel" open>
        <summary>Filialen in ritten</summary>
        <div className="body">
          <p className="hint">
            Haal het vinkje weg bij filialen die je nooit wilt bezoeken. Die
            worden niet meegenomen in de Ritje-check en in combinatieroutes.
            Filialen buiten Nederland staan standaard uit. Wijzigingen worden
            direct opgeslagen.
          </p>
          <StoresByCountry stores={stores}>
            {(s) => (
              <label key={s.storeId}>
                <input
                  type="checkbox"
                  defaultChecked={!s.tripExcluded}
                  onChange={(event) => {
                    void send(`/api/stores/${s.storeId}/trip-excluded`, "PUT", {
                      excluded: !event.target.checked,
                    });
                  }}
                />
                {` ${s.name}`}
              </label>
            )}
          </StoresByCountry>
        </div>
      </details>
    </div>
  );
}
