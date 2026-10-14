"use client";

import { Fragment, useEffect, useState } from "react";

import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import { ago } from "@/lib/format.ts";
import type { StoreRow } from "@/server/db.ts";
import type { PollStatus } from "@/server/poller.ts";
import type { PublicGlobalSettings } from "@/server/settings.ts";

type StatusResponse = PollStatus & { stores: StoreRow[] };

const ORDER = ["nl", "be", "de"] as const;
const NAMES: Record<string, string> = {
  nl: "Nederland",
  be: "België",
  de: "Duitsland",
};
const STATUS_REFRESH_MS = 10_000;

export function FetchTab() {
  const settings = useApiData<PublicGlobalSettings>("/api/admin/settings");
  return settings.data ? (
    <FetchPanel
      initialInterval={settings.data.pollIntervalMin}
      reloadSettings={settings.reload}
    />
  ) : null;
}

function FetchPanel({
  initialInterval,
  reloadSettings,
}: {
  initialInterval: number;
  reloadSettings: () => Promise<void>;
}) {
  const status = useApiData<StatusResponse>("/api/admin/status");
  const [pollInterval, setPollInterval] = useState(String(initialInterval));
  const [message, setMessage] = useState({ text: "", error: false });
  const { reload } = status;

  useEffect(() => {
    const timer = setInterval(() => {
      void reload();
    }, STATUS_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reload]);

  const saveInterval = async () => {
    try {
      await send("/api/admin/settings", "PUT", {
        pollIntervalMin: Number(pollInterval),
      });
      await reloadSettings();
      setMessage({ text: "Opgeslagen", error: false });
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    }
  };

  const st = status.data;
  return (
    <div>
      <details className="channel" open>
        <summary>Ophalen</summary>
        <div className="body">
          <p className="hint">
            Alle filialen van alle landen worden voor iedereen op de achtergrond
            opgehaald.
          </p>
          <div className="field">
            <label htmlFor="interval">Interval (minuten, 5–1440)</label>
            <input
              type="number"
              id="interval"
              min={5}
              max={1440}
              inputMode="numeric"
              value={pollInterval}
              onChange={(event) => {
                setPollInterval(event.target.value);
              }}
            />
          </div>
          <div className="row">
            <button type="button" onClick={() => void saveInterval()}>
              Opslaan
            </button>
            <span className={message.error ? "err" : "hint"}>
              {message.text}
            </span>
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>Status</summary>
        <div className="body">
          <div className="row">
            <button
              type="button"
              className="secondary"
              disabled={st?.running === true}
              onClick={() => {
                void send("/api/admin/sync", "POST").then(reload);
              }}
            >
              Nu verversen
            </button>
            <span className="hint">
              {st?.running
                ? "Bezig met ophalen…"
                : st?.finishedAt
                  ? `Laatste run: ${ago(st.finishedAt)}`
                  : ""}
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Filiaal</th>
                  <th>Aanbiedingen</th>
                  <th>Laatst opgehaald</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map((country) => {
                  const stores =
                    st?.stores.filter((s) => s.country === country) ?? [];
                  if (stores.length === 0) return null;
                  return (
                    <Fragment key={country}>
                      <tr className="group-head">
                        <td colSpan={4}>{NAMES[country]}</td>
                      </tr>
                      {stores.map((s) => (
                        <tr key={s.storeId}>
                          <td>{s.name}</td>
                          <td>{s.activeOffers}</td>
                          <td>{ago(s.lastSynced)}</td>
                          <td className={s.lastError ? "err" : ""}>
                            {s.lastError ?? (s.lastSynced ? "OK" : "–")}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
