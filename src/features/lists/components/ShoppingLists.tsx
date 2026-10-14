"use client";

import Link from "next/link";
import { useState } from "react";

import { Chip } from "@/components/ui/Chip.tsx";
import { useDialogs } from "@/components/ui/DialogProvider.tsx";
import { Empty } from "@/components/ui/Empty.tsx";
import { IconLabel } from "@/components/ui/Icon.tsx";
import { IconButton } from "@/components/ui/IconButton.tsx";
import { Stepper } from "@/components/ui/Stepper.tsx";
import { send } from "@/lib/api-client.ts";
import { countryTag, money } from "@/lib/format.ts";
import type { ListItemView, ListView } from "@/server/lists.ts";

import { ImportDialog } from "./ImportDialog.tsx";

const ACTIVE_LIST_KEY = "activeList";

const readActive = (): number => {
  try {
    return Number(sessionStorage.getItem(ACTIVE_LIST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const unitPriceText = (it: ListItemView): string => {
  if (it.estimateUnit === undefined) return "prijs onbekend";
  const source =
    it.estimateSource === "tweedekans"
      ? `tweedekans nu${it.bestOffer ? ` · ${it.bestOffer.storeName}${countryTag(it.bestOffer.country)}` : ""}`
      : "nieuwprijs";
  return `~${money(it.estimateUnit)} p/st · ${source}`;
};

export function ShoppingLists({
  lists,
  onChanged,
  onBuy,
}: {
  lists: ListView[];
  onChanged: () => void;
  onBuy: (item: ListItemView) => void;
}) {
  const dialogs = useDialogs();
  const [stored, setStored] = useState(readActive);
  const [importing, setImporting] = useState(false);
  const active = lists.find((l) => l.id === stored) ?? lists[0];

  const choose = (id: number) => {
    setStored(id);
    try {
      sessionStorage.setItem(ACTIVE_LIST_KEY, String(id));
    } catch {
      /* the active list is a convenience only */
    }
  };

  const createList = async () => {
    const name = await dialogs.prompt({
      title: "Nieuwe lijst",
      label: "Naam van de lijst (bijv. Keuken)",
      confirmText: "Aanmaken",
    });
    if (!name) return;
    const created = await send<{ id: number }>("/api/lists", "POST", { name });
    choose(created.id);
    onChanged();
  };

  return (
    <div>
      <div className="pill-row">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            className={l.id === active?.id ? "pill active" : "pill"}
            onClick={() => {
              choose(l.id);
            }}
          >
            {l.name}
            <small>{`${String(l.totals.bought)}/${String(l.totals.pieces)}`}</small>
          </button>
        ))}
        <button
          type="button"
          className="pill"
          onClick={() => void createList()}
        >
          <IconLabel name="plus">Nieuwe lijst</IconLabel>
        </button>
      </div>
      {active ? (
        <ListBody
          list={active}
          onChanged={onChanged}
          onBuy={onBuy}
          onImport={() => {
            setImporting(true);
          }}
        />
      ) : (
        <Empty>
          Nog geen boodschappenlijst. Kies &quot;Nieuwe lijst&quot; (bijv.
          Keuken, Woonkamerkast, Slaapkamer).
        </Empty>
      )}
      {importing && active ? (
        <ImportDialog
          listId={active.id}
          onClose={() => {
            setImporting(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ListBody({
  list,
  onChanged,
  onBuy,
  onImport,
}: {
  list: ListView;
  onChanged: () => void;
  onBuy: (item: ListItemView) => void;
  onImport: () => void;
}) {
  const dialogs = useDialogs();
  const t = list.totals;
  const pct = t.pieces ? Math.round((t.bought / t.pieces) * 100) : 0;
  const allWatched =
    list.items.length > 0 && list.items.every((i) => i.watched);
  const open = list.items.filter((i) => i.remaining > 0);
  const done = list.items.filter((i) => i.remaining <= 0);
  const approx = t.toBuy > 0 ? "~" : "";

  return (
    <>
      <div className="listbar">
        <h2>{list.name}</h2>
        <button
          type="button"
          title="Producten uit een tekstlijst (bijv. een keukenbon) toevoegen"
          onClick={onImport}
        >
          Importeren
        </button>
        <button
          type="button"
          className="secondary"
          disabled={list.items.length === 0}
          onClick={() => {
            void send(`/api/lists/${String(list.id)}/watch`, "PUT", {
              watched: !allWatched,
            }).then(onChanged);
          }}
        >
          {allWatched ? "Alles van watchlist halen" : "Alles op de watchlist"}
        </button>
        <IconButton
          name="edit"
          label="Lijst hernoemen"
          onClick={() => {
            void (async () => {
              const name = await dialogs.prompt({
                title: "Lijst hernoemen",
                label: "Nieuwe naam",
                value: list.name,
              });
              if (!name) return;
              await send(`/api/lists/${String(list.id)}`, "PUT", { name });
              onChanged();
            })();
          }}
        />
        <IconButton
          name="trash"
          label="Lijst verwijderen"
          tone="danger"
          onClick={() => {
            void (async () => {
              const ok = await dialogs.confirm({
                title: "Lijst verwijderen",
                message: `Lijst "${list.name}" met alle items en aankopen verwijderen?`,
              });
              if (!ok) return;
              await send(`/api/lists/${String(list.id)}`, "DELETE");
              onChanged();
            })();
          }}
        />
      </div>

      <section className="panel">
        <div className="bon">
          <Figure label="Totaal" value={`${approx}${money(t.total)}`} />
          <Figure label="Al betaald" value={money(t.paid)} />
          <Figure label="Nog te kopen" value={`${approx}${money(t.toBuy)}`} />
          <Figure
            label="Nieuwprijs"
            value={t.atNewPrice ? money(t.atNewPrice) : "–"}
          />
          <Figure
            label="Bespaard"
            value={t.atNewPrice ? `${approx}${money(t.saving)}` : "–"}
            good={t.saving > 0}
          />
        </div>
        <div className="progress">
          <span style={{ width: `${String(pct)}%` }} />
        </div>
        <div className="hint">{`${String(t.bought)} van ${String(t.pieces)} stuks gekocht`}</div>
      </section>

      <section className="panel">
        <h2>Nog te kopen</h2>
        {open.length > 0 ? (
          open.map((item) => (
            <Line
              key={item.id}
              item={item}
              onChanged={onChanged}
              onBuy={onBuy}
            />
          ))
        ) : (
          <Empty>
            {list.items.length > 0
              ? "Alles gekocht."
              : 'Deze lijst is leeg. Gebruik "Importeren", of kies "Op lijst" bij Zoeken in producten.'}
          </Empty>
        )}
      </section>

      {done.length > 0 ? (
        <section className="panel">
          <h2>Gekocht</h2>
          {done.map((item) => (
            <Line
              key={item.id}
              item={item}
              onChanged={onChanged}
              onBuy={onBuy}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

function Figure({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className={good ? "v good" : "v"}>{value}</div>
    </div>
  );
}

function Line({
  item,
  onChanged,
  onBuy,
}: {
  item: ListItemView;
  onChanged: () => void;
  onBuy: (item: ListItemView) => void;
}) {
  const done = item.remaining <= 0;
  const pct = item.quantity
    ? Math.round((item.bought / item.quantity) * 100)
    : 0;
  const estimated = item.remaining > 0 && item.estimateUnit !== undefined;
  const act = (request: Promise<unknown>) => {
    void request.then(onChanged);
  };

  return (
    <div className={done ? "line done" : "line"}>
      <Link href={`/product/${item.articleNumber}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images */}
        <img src={item.image ?? ""} loading="lazy" alt="" />
      </Link>
      <div>
        <Link className="ltitle" href={`/product/${item.articleNumber}`}>
          {`${item.name} ${item.typeName}`.trim()}
        </Link>
        <div className="meta">
          {`art. ${item.articleNumber}${item.measure ? ` · ${item.measure}` : ""}`}
        </div>
        <div className="meta">
          {`${String(item.bought)} van ${String(item.quantity)} gekocht · aantal `}
          <Stepper
            value={item.quantity}
            min={Math.max(item.bought, 1)}
            onChange={(quantity) => {
              act(
                send(`/api/list-items/${String(item.id)}`, "PUT", { quantity }),
              );
            }}
          />
        </div>
        <div className="mini-bar">
          <span style={{ width: `${String(pct)}%` }} />
        </div>
        <div className="meta">{done ? "Gekocht" : unitPriceText(item)}</div>
        <div className="tools">
          {done ? null : (
            <button
              type="button"
              className="secondary mini"
              onClick={() => {
                onBuy(item);
              }}
            >
              <IconLabel name="check">Gekocht</IconLabel>
            </button>
          )}
          <IconButton
            name="eye"
            label={
              item.watched
                ? "Niet meer bewaken (watchlist)"
                : "Op de watchlist zetten"
            }
            {...(item.watched ? { tone: "on" as const } : {})}
            onClick={() => {
              act(
                send(`/api/list-items/${String(item.id)}/watch`, "PUT", {
                  watched: !item.watched,
                }),
              );
            }}
          />
          <IconButton
            name="trash"
            label="Van lijst halen"
            tone="danger"
            onClick={() => {
              act(send(`/api/list-items/${String(item.id)}`, "DELETE"));
            }}
          />
          {item.watched ? <Chip kind="info">op watchlist</Chip> : null}
        </div>
      </div>
      <div className="price">
        <div className="total">
          {`${estimated ? "~" : ""}${money(item.lineTotal)}`}
        </div>
        {item.paid > 0 ? (
          <small>{`waarvan betaald ${money(item.paid)}`}</small>
        ) : null}
        {estimated && item.estimateUnit !== undefined ? (
          <small>{`${String(item.remaining)} × ~${money(item.estimateUnit)}`}</small>
        ) : null}
      </div>
      {item.purchases.length > 0 ? (
        <div className="purch">
          {item.purchases.map((p) => (
            <div key={p.id}>
              <span>
                {`${String(p.quantity)}× ${p.unitPrice === undefined ? "prijs niet bekend" : money(p.unitPrice)}${p.storeName ? ` · ${p.storeName}` : ""} · ${new Date(p.purchasedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`}
              </span>
              <IconButton
                name="undo"
                label="Ongedaan maken"
                onClick={() => {
                  act(send(`/api/purchases/${String(p.id)}`, "DELETE"));
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
