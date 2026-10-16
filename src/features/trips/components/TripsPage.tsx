"use client";

import "../trips.css";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Chip } from "@/components/ui/Chip.tsx";
import { Empty } from "@/components/ui/Empty.tsx";
import { IconLabel } from "@/components/ui/Icon.tsx";
import { api, errorMessage, send } from "@/lib/api-client.ts";
import { countryTag, duration, money } from "@/lib/format.ts";
import type {
  BestRoute,
  StoreTrip,
  TripResult,
  TripsResponse,
  TripStatus,
} from "@/server/trips.ts";

type Configured = Extract<TripsResponse, { configured: true }>;
type Stop = { lat: number | undefined; lon: number | undefined };

type DoneUnit = {
  articleNumber: string;
  count: number;
  unitPrice: number;
  storeName: string;
};

const statusKind = (status: TripStatus): "good" | "warn" | "bad" =>
  status === "good" ? "good" : status === "time" ? "warn" : "bad";

const statusLabel = (status: TripStatus, tooLong = false): string => {
  if (tooLong) return "Langer dan je maximale tijd";
  if (status === "good") return "Rendabel";
  if (status === "time") return "Rendabel in geld, niet in tijd";
  return "Niet de moeite waard";
};

const signed = (n: number): string =>
  `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

const storeLabel = (s: {
  storeName: string;
  country: string;
  followed: boolean;
}): string =>
  `${s.storeName}${countryTag(s.country)}${s.followed ? " (gevolgd)" : ""}`;

const routeTitle = (r: BestRoute): string => {
  const names = r.stops.map(storeLabel);
  const [first, second] = names;
  if (names.length === 1) return first ?? "";
  if (names.length === 2) return `${first ?? ""} via ${second ?? ""}`;
  return `${first ?? ""} via ${names.slice(1, -1).join(", ")} naar ${names[names.length - 1] ?? ""}`;
};

/** Google Maps directions: home -> stops -> home. */
function mapsUrl(postcode: string, stops: Stop[]): string {
  const home = `${postcode}, Nederland`;
  const waypoints = stops
    .filter((p) => p.lat !== undefined && p.lon !== undefined)
    .map((p) => `${String(p.lat)},${String(p.lon)}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: home,
    destination: home,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function TimeFacts({
  x,
  hourlyRate,
}: {
  x: TripResult | BestRoute;
  hourlyRate: number;
}) {
  return (
    <>
      <Fact label="Rijtijd" value={duration(x.driveMinutes)} />
      <Fact label="In de winkel" value={duration(x.stopMinutes)} />
      <Fact label="Totale tijd" value={duration(x.totalMinutes)} />
      {hourlyRate > 0 ? (
        <>
          <Fact
            label={`Tijdkosten (${money(hourlyRate)}/uur)`}
            value={money(x.timeCost)}
          />
          <Fact label="Netto in geld" value={money(x.moneyNet)} />
        </>
      ) : null}
    </>
  );
}

function MapActions({
  postcode,
  stops,
  title,
}: {
  postcode: string;
  stops: Stop[];
  title: string;
}) {
  const url = mapsUrl(postcode, stops);
  const [state, setState] = useState<
    { text: string; busy: boolean } | undefined
  >();
  const share = async () => {
    setState({ text: "", busy: true });
    try {
      await send("/api/trips/share", "POST", { url, title });
      setState({ text: "Verstuurd", busy: false });
    } catch (e) {
      setState({ text: errorMessage(e), busy: false });
    }
  };
  return (
    <div className="map-actions">
      <a
        className="btn mini"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconLabel name="map">Bekijk op kaart</IconLabel>
      </a>
      <button
        type="button"
        className="secondary mini"
        disabled={state?.busy === true}
        onClick={() => void share()}
      >
        {state?.text === "Verstuurd" ? (
          <IconLabel name="check">Verstuurd</IconLabel>
        ) : state?.text !== undefined && state.text !== "" ? (
          state.text
        ) : (
          <IconLabel name="phone">Naar mijn telefoon</IconLabel>
        )}
      </button>
    </div>
  );
}

/** Ticks the given units off the shopping list and recalculates. */
function DoneButton({
  units,
  onDone,
}: {
  units: DoneUnit[];
  onDone: () => void;
}) {
  const [state, setState] = useState<{ busy: boolean; error: string }>({
    busy: false,
    error: "",
  });
  return (
    <button
      type="button"
      className="secondary mini"
      title="Zet deze aantallen met deze prijzen als gekocht op je boodschappenlijst"
      disabled={state.busy}
      onClick={() => {
        setState({ busy: true, error: "" });
        void send("/api/list/purchase", "POST", { items: units })
          .then(() => {
            setState({ busy: false, error: "" });
            onDone();
          })
          .catch((e: unknown) => {
            setState({ busy: false, error: errorMessage(e) });
          });
      }}
    >
      {state.error ? state.error : <IconLabel name="check">Gehaald</IconLabel>}
    </button>
  );
}

function RouteBody({
  r,
  data,
  onDone,
}: {
  r: BestRoute;
  data: Configured;
  onDone: () => void;
}) {
  return (
    <>
      <div className="facts">
        <Fact label="Afstand totaal" value={`${String(r.totalKm)} km`} />
        <TimeFacts x={r} hourlyRate={data.hourlyRate} />
        <Fact label="Brandstof" value={money(r.tripCost)} />
        <Fact label="Besparing" value={money(r.saving)} />
        <Fact label="Te betalen" value={money(r.spend)} />
      </div>
      {r.approximateOrder ? (
        <p className="hint">Volgorde is een benadering (meer dan 4 stops).</p>
      ) : null}
      <MapActions
        postcode={data.postcode}
        stops={r.stops}
        title={routeTitle(r)}
      />
      <div className="stops">
        {r.stops.map((s) => (
          <div className="stop" key={s.storeId}>
            <div className="where">
              {storeLabel(s)}
              <small>{`${String(s.legKm)} km · ${duration(s.legMinutes)} rijden`}</small>
            </div>
            <div className="what">
              {s.units.map((u) => `${String(u.count)}× ${u.name}`).join(", ")}
            </div>
            <DoneButton
              onDone={onDone}
              units={s.units.map((u) => ({
                articleNumber: u.articleNumber,
                count: u.count,
                unitPrice: Math.round((u.spend / u.count) * 100) / 100,
                storeName: s.storeName,
              }))}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function BestPanel({
  r,
  data,
  onDone,
}: {
  r: BestRoute;
  data: Configured;
  onDone: () => void;
}) {
  const kind = statusKind(r.status);
  return (
    <section className={`panel trip route ${kind}`}>
      <header>
        <h3>{`Slimste route: ${routeTitle(r)}`}</h3>
        <Chip kind={kind}>{statusLabel(r.status)}</Chip>
        <span className={`net ${kind}`}>{signed(r.net)}</span>
      </header>
      {r.stops.length > 1 && r.bestSingleName ? (
        <p className="hint">
          {r.gainOverSingle > 0
            ? `${money(r.gainOverSingle)} beter dan alleen ${r.bestSingleName}`
            : `Even goed als alleen ${r.bestSingleName}`}
        </p>
      ) : null}
      <RouteBody r={r} data={data} onDone={onDone} />
    </section>
  );
}

function AltRoute({
  r,
  data,
  onDone,
}: {
  r: BestRoute;
  data: Configured;
  onDone: () => void;
}) {
  const kind = statusKind(r.status);
  return (
    <details className="alt">
      <summary>
        <strong>{routeTitle(r)}</strong>
        <Chip kind={kind}>{statusLabel(r.status)}</Chip>
        <span className="meta">{`${String(r.totalKm)} km · ${duration(r.totalMinutes)}`}</span>
        <span className={`net ${kind}`}>{signed(r.net)}</span>
      </summary>
      <div>
        <RouteBody r={r} data={data} onDone={onDone} />
      </div>
    </details>
  );
}

function StoreCard({
  t,
  data,
  onDone,
}: {
  t: StoreTrip;
  data: Configured;
  onDone: () => void;
}) {
  const lines = t.items.filter((i) => i.found > 0);
  const kind = statusKind(t.status);
  return (
    <section className="panel trip">
      <header>
        <h3>{storeLabel(t)}</h3>
        <Chip kind={kind}>{statusLabel(t.status, t.tooLong)}</Chip>
        <span className={`net ${kind}`}>{signed(t.net)}</span>
      </header>
      <div className="facts">
        <Fact
          label="Enkele reis"
          value={`${t.distanceSource === "estimate" ? "~" : ""}${String(t.oneWayKm)} km`}
        />
        <TimeFacts x={t} hourlyRate={data.hourlyRate} />
        <Fact label="Brandstof" value={money(t.tripCost)} />
        <Fact label="Besparing" value={money(t.saving)} />
        <Fact label="Te betalen" value={money(t.spend)} />
      </div>
      {lines.map((i) => (
        <div className="line" key={i.articleNumber}>
          <Link href={`/product/${i.articleNumber}`}>{i.name}</Link>
          <span className="num">{`${String(i.found)} van ${String(i.wanted)}`}</span>
          <span className="num">{money(i.spend)}</span>
          <span className="num meta">
            {i.saving ? `bespaart ${money(i.saving)}` : "nieuwprijs onbekend"}
          </span>
        </div>
      ))}
      <MapActions postcode={data.postcode} stops={[t]} title={storeLabel(t)} />
      <div className="footer-actions">
        <DoneButton
          onDone={onDone}
          units={lines.map((i) => ({
            articleNumber: i.articleNumber,
            count: i.found,
            unitPrice: Math.round((i.spend / i.found) * 100) / 100,
            storeName: t.storeName,
          }))}
        />
      </div>
    </section>
  );
}

export function TripsPage() {
  const [data, setData] = useState<TripsResponse | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<TripsResponse>("/api/trips"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    void load();
  };

  return (
    <main className="trips-page">
      <h1>Ritje-check</h1>
      <p className="lead">
        Is een rit de moeite waard? Besparing t.o.v. nieuwprijs op wat je nog
        nodig hebt (boodschappenlijst), minus brandstof en eventueel tijd.
      </p>
      {error ? <Empty>{`Berekenen mislukt: ${error}`}</Empty> : null}
      {!error && !data ? (
        <div className="hint">Afstanden berekenen…</div>
      ) : null}
      {data && !data.configured ? <NotConfigured reason={data.reason} /> : null}
      {data?.configured ? <Result data={data} onDone={reload} /> : null}
    </main>
  );
}

function NotConfigured({ reason }: { reason: string }) {
  const target = reason.includes("postcode")
    ? { href: "/settings#ritje", label: "Naar instellingen" }
    : reason.includes("gehaald")
      ? { href: "/watchlist#boodschappen", label: "Naar boodschappenlijst" }
      : { href: "/watchlist", label: "Naar lijsten" };
  return (
    <Empty>
      {`${reason}. `}
      <Link href={target.href}>{target.label}</Link>
    </Empty>
  );
}

function Result({ data, onDone }: { data: Configured; onDone: () => void }) {
  const relevant = data.stores.filter((t) => t.items.some((i) => i.found > 0));
  const empties = data.stores.filter((t) => !t.items.some((i) => i.found > 0));
  return (
    <>
      <div className="summary-bar">
        <Fact label="Vanaf" value={data.postcode} />
        <Fact label="Benzine" value={`${money(data.fuelPrice)}/l`} />
        <Fact
          label="Verbruik"
          value={`${String(data.consumptionPer100km)} l/100 km`}
        />
        <Fact label="Nog nodig" value={`${String(data.wantedUnits)} stuks`} />
      </div>
      <div>
        {data.bestRoute ? (
          <BestPanel r={data.bestRoute} data={data} onDone={onDone} />
        ) : data.maxTripMinutes > 0 ? (
          <Empty>
            {`Geen route binnen ${duration(data.maxTripMinutes)} die iets oplevert.`}
          </Empty>
        ) : null}
        {data.alternatives.length > 0 ? (
          <>
            <h2 className="section">
              {`Andere rendabele routes (${String(data.alternatives.length)})`}
            </h2>
            {data.alternatives.map((r) => (
              <AltRoute
                key={r.stops.map((s) => s.storeId).join("-")}
                r={r}
                data={data}
                onDone={onDone}
              />
            ))}
          </>
        ) : null}
      </div>
      <div>
        <h2 className="section">Per filiaal</h2>
        {relevant.length > 0 ? (
          relevant.map((t) => (
            <StoreCard key={t.storeId} t={t} data={data} onDone={onDone} />
          ))
        ) : (
          <Empty>Niets van je lijst ligt nu in een filiaal.</Empty>
        )}
        {empties.length > 0 ? (
          <details className="panel">
            <summary>{`${String(empties.length)} filialen hebben niets van je lijst`}</summary>
            <div className="facts">
              {empties.map((t) => (
                <span key={t.storeId}>
                  {`${t.storeName}${countryTag(t.country)} (${String(t.oneWayKm)} km)`}
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
