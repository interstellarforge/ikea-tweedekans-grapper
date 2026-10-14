"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal.tsx";
import { Stepper } from "@/components/ui/Stepper.tsx";
import { errorMessage, send } from "@/lib/api-client.ts";
import { money } from "@/lib/format.ts";

const MAX_PIECES = 50;

export type BuyTarget = {
  /** List item id when the purchase belongs to a shopping-list line. */
  listItemId: number | undefined;
  articleNumber: string;
  name: string;
  image: string | undefined;
  remaining: number;
  /** Suggested price per piece. */
  estimate: number | undefined;
  /** Where the suggested price comes from; undefined = regular price. */
  bestStore: string | undefined;
  hasOffer: boolean;
};

type Piece = { value: string; touched: boolean };

/** Records what was paid per piece; the first price is the default for untouched pieces. */
export function BuyDialog({
  target,
  onClose,
  onDone,
}: {
  target: BuyTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const max = Math.max(1, Math.min(target.remaining, MAX_PIECES));
  const fallback = target.estimate === undefined ? "" : String(target.estimate);
  const [pieces, setPieces] = useState<Piece[]>([
    { value: fallback, touched: false },
  ]);
  const [store, setStore] = useState(target.bestStore ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setCount = (count: number) => {
    setPieces((current) =>
      Array.from(
        { length: count },
        (_, i) =>
          current[i] ?? {
            value: current[0]?.value ?? fallback,
            touched: false,
          },
      ),
    );
  };

  const setPrice = (index: number, value: string) => {
    setPieces((current) =>
      current.map((piece, i) => {
        if (i === index) return { value, touched: true };
        if (index === 0 && i > 0 && !piece.touched) return { ...piece, value };
        return piece;
      }),
    );
  };

  const total = pieces.reduce((sum, p) => sum + (Number(p.value) || 0), 0);

  const save = async () => {
    const prices = pieces.map((p) =>
      p.value === "" ? undefined : Number(p.value),
    );
    setSaving(true);
    try {
      if (target.listItemId !== undefined) {
        await send(
          `/api/list-items/${String(target.listItemId)}/purchase`,
          "POST",
          {
            pieces: prices.map((p) => p ?? null),
            storeName: store,
          },
        );
      } else {
        for (const price of prices) {
          await send("/api/list/purchase", "POST", {
            items: [
              {
                articleNumber: target.articleNumber,
                count: 1,
                unitPrice: price,
                storeName: store || undefined,
              },
            ],
          });
        }
      }
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Gekocht"
      onClose={onClose}
      footer={
        <>
          <span className="err">{error}</span>
          <button type="button" className="secondary" onClick={onClose}>
            Annuleren
          </button>
          <button type="button" disabled={saving} onClick={() => void save()}>
            Opslaan
          </button>
        </>
      }
    >
      <div className="buy-product">
        {/* eslint-disable-next-line @next/next/no-img-element -- IKEA CDN images */}
        <img src={target.image ?? ""} alt="" />
        <div>
          <strong>{target.name}</strong>
          <div className="meta">{`art. ${target.articleNumber} · nog ${String(target.remaining)} nodig`}</div>
        </div>
      </div>
      <div className="field-row">
        <span className="label">Aantal gekocht</span>
        <Stepper value={pieces.length} max={max} onChange={setCount} />
      </div>
      <div>
        {pieces.map((piece, index) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- pieces are positional (stuk 1..n)
          <div className="field-row" key={index}>
            <label
              htmlFor={`buy-price-${String(index)}`}
            >{`Stuk ${String(index + 1)}`}</label>
            <div className="money-input">
              <span>€</span>
              <input
                id={`buy-price-${String(index)}`}
                type="number"
                min={0}
                step="0.01"
                value={piece.value}
                aria-label={`Prijs stuk ${String(index + 1)}`}
                onChange={(event) => {
                  setPrice(index, event.target.value);
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="field-row">
        <label htmlFor="buy-store">Winkel</label>
        <input
          id="buy-store"
          type="text"
          placeholder="optioneel"
          value={store}
          onChange={(event) => {
            setStore(event.target.value);
          }}
        />
      </div>
      <p className="hint">
        {target.estimate === undefined
          ? "Vul de prijs per stuk in."
          : `Voorgesteld: ${money(target.estimate)} per stuk (${target.hasOffer ? "tweedekans nu" : "nieuwprijs"}). Pas aan als je een andere prijs betaalde.`}
      </p>
      <div className="buy-total">
        <span>Totaal</span>
        <span>{money(total)}</span>
      </div>
    </Modal>
  );
}
