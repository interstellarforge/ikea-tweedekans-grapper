"use client";

import { send } from "@/lib/api-client.ts";
import type { StoreRow } from "@/server/db.ts";

const COUNTRY_NAMES: Record<string, string> = {
  nl: "Nederland",
  be: "België",
  de: "Duitsland",
};
const COUNTRY_ORDER = ["nl", "be", "de"] as const;

/** Stores grouped under a country heading (the heading is skipped when there is one country). */
export function StoresByCountry({
  stores,
  children,
}: {
  stores: StoreRow[];
  children: (store: StoreRow) => React.ReactNode;
}) {
  const countries = COUNTRY_ORDER.filter((c) =>
    stores.some((s) => s.country === c),
  );
  return (
    <div className="stores">
      {countries.map((c) => (
        <CountryGroup
          key={c}
          heading={countries.length > 1 ? COUNTRY_NAMES[c] : undefined}
        >
          {stores.filter((s) => s.country === c).map(children)}
        </CountryGroup>
      ))}
    </div>
  );
}

function CountryGroup({
  heading,
  children,
}: {
  heading: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <>
      {heading ? (
        <strong style={{ gridColumn: "1 / -1", marginTop: 8 }}>
          {heading}
        </strong>
      ) : null}
      {children}
    </>
  );
}

export function StoresTab({
  stores,
  countries,
  onCountries,
}: {
  stores: StoreRow[];
  countries: string[];
  onCountries: (countries: string[]) => Promise<void>;
}) {
  const toggleCountry = (code: string, checked: boolean) => {
    const chosen = COUNTRY_ORDER.filter((c) =>
      c === code ? checked : countries.includes(c),
    );
    if (chosen.length === 0) return;
    void onCountries([...chosen]);
  };

  return (
    <div>
      <details className="channel" open>
        <summary>Landen</summary>
        <div className="body">
          <p className="hint">
            Van welke landen zie je filialen en aanbiedingen? De gegevens van
            alle filialen worden voor iedereen op de achtergrond bijgehouden.
            Duitsland heeft 54 filialen en maakt lijsten en ritberekeningen
            groter.
          </p>
          <div className="stores">
            {COUNTRY_ORDER.map((code) => (
              <label key={code}>
                <input
                  type="checkbox"
                  checked={countries.includes(code)}
                  onChange={(event) => {
                    toggleCountry(code, event.target.checked);
                  }}
                />
                {` ${COUNTRY_NAMES[code] ?? code}`}
              </label>
            ))}
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>Gevolgde filialen</summary>
        <div className="body">
          <p className="hint">
            Meldingen voor producten op je watchlist komen alleen uit filialen
            die je volgt, en die staan overal bovenaan. Wijzigingen worden
            direct opgeslagen.
          </p>
          <StoresByCountry stores={stores}>
            {(s) => <FollowBox key={s.storeId} store={s} />}
          </StoresByCountry>
        </div>
      </details>
    </div>
  );
}

function FollowBox({ store }: { store: StoreRow }) {
  return (
    <label>
      <input
        type="checkbox"
        defaultChecked={store.followed}
        onChange={(event) => {
          void send(`/api/stores/${store.storeId}/followed`, "PUT", {
            followed: event.target.checked,
          });
        }}
      />
      {` ${store.name}`}
    </label>
  );
}
