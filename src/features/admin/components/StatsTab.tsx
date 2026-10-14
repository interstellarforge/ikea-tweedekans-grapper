"use client";

import { useState } from "react";

import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import { money } from "@/lib/format.ts";
import type { PublicStatsConfig, Stat } from "@/server/stats.ts";

type StatsResponse = { stats: Stat[]; public: PublicStatsConfig };

const numberFormat = new Intl.NumberFormat("nl-NL");

const valueText = (s: Stat): string =>
  s.format === "eur" ? money(s.value) : numberFormat.format(s.value);

export function StatsTab() {
  const { data } = useApiData<StatsResponse>("/api/admin/stats");
  return data ? <StatsEditor data={data} /> : null;
}

function StatsEditor({ data }: { data: StatsResponse }) {
  const [enabled, setEnabled] = useState(data.public.enabled);
  const [keys, setKeys] = useState(() => new Set(data.public.keys));
  const [message, setMessage] = useState("");

  const toggle = (key: string, on: boolean) => {
    setKeys((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const save = async () => {
    setMessage("Opslaan…");
    try {
      await send("/api/admin/stats-public", "PUT", {
        enabled,
        keys: [...keys],
      });
      setMessage("Opgeslagen");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const groups = new Map<string, Stat[]>();
  for (const stat of data.stats) {
    groups.set(stat.group, [...(groups.get(stat.group) ?? []), stat]);
  }

  return (
    <div>
      <details className="channel" open>
        <summary>Op de landingspagina</summary>
        <div className="body">
          <p className="hint">
            Kies hieronder welke cijfers bezoekers op de startpagina zien.
            Alleen cijfers groter dan 0 worden getoond; zonder keuze of met de
            schakelaar uit verschijnt de sectie niet.
          </p>
          <div className="field">
            <label htmlFor="pubOn">Tonen</label>
            <span>
              <input
                type="checkbox"
                id="pubOn"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                }}
              />
              <label htmlFor="pubOn">Toon de geselecteerde cijfers</label>
            </span>
          </div>
          <div className="row">
            <button type="button" onClick={() => void save()}>
              Opslaan
            </button>
            <span className="hint">{message}</span>
          </div>
        </div>
      </details>
      {[...groups].map(([name, list]) => (
        <section className="stat-group" key={name}>
          <h2>{name}</h2>
          <div className="stat-grid">
            {list.map((stat) => (
              <div className="stat" key={stat.key}>
                <strong>{valueText(stat)}</strong>
                <span>{stat.label}</span>
                <label className="stat-pub" htmlFor={`pub-${stat.key}`}>
                  <input
                    type="checkbox"
                    id={`pub-${stat.key}`}
                    checked={keys.has(stat.key)}
                    onChange={(event) => {
                      toggle(stat.key, event.target.checked);
                    }}
                  />
                  {" Op landing"}
                </label>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
