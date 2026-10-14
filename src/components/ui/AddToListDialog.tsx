"use client";

import { useEffect, useState } from "react";

import { api, errorMessage, send } from "@/lib/api-client.ts";
import type { ListView } from "@/server/lists.ts";

import { Modal } from "./Modal.tsx";

export type ListProductInput = {
  articleNumber: string;
  name: string;
  typeName?: string;
  measure?: string;
  image?: string | undefined;
  url?: string | undefined;
  price?: number | undefined;
};

const NEW_LIST = "new";
const CLOSE_DELAY_MS = 600;

/** Puts a product on one of the shopping lists (or a new one). */
export function AddToListDialog({
  product,
  onClose,
}: {
  product: ListProductInput;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<ListView[] | undefined>(undefined);
  const [target, setTarget] = useState(NEW_LIST);
  const [newName, setNewName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<ListView[]>("/api/lists").then((loaded) => {
      setLists(loaded);
      if (loaded[0]) setTarget(String(loaded[0].id));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      let listId = Number(target);
      if (target === NEW_LIST) {
        const created = await send<{ id: number }>("/api/lists", "POST", {
          name: newName || "Nieuwe lijst",
        });
        listId = created.id;
      }
      await send(`/api/lists/${String(listId)}/items`, "POST", {
        articleNumber: product.articleNumber,
        quantity,
        mode: "add",
        product,
      });
      setMessage({ text: "Toegevoegd", error: false });
      setTimeout(onClose, CLOSE_DELAY_MS);
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Op boodschappenlijst"
      onClose={onClose}
      footer={
        <>
          {message ? (
            <span className={message.error ? "err" : "hint"}>
              {message.text}
            </span>
          ) : null}
          <button type="button" className="secondary" onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            disabled={saving || lists === undefined}
            onClick={() => void save()}
          >
            Toevoegen
          </button>
        </>
      }
    >
      <p>
        <strong>{`${product.name} ${product.typeName ?? ""}`.trim()}</strong>
      </p>
      <div className="row">
        <label htmlFor="atl-list">Lijst</label>
        <select
          id="atl-list"
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
          }}
        >
          {(lists ?? []).map((list) => (
            <option key={list.id} value={String(list.id)}>
              {list.name}
            </option>
          ))}
          <option value={NEW_LIST}>Nieuwe lijst…</option>
        </select>
        {target === NEW_LIST ? (
          <input
            type="text"
            placeholder="Naam van de nieuwe lijst"
            aria-label="Naam van de nieuwe lijst"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
            }}
          />
        ) : null}
      </div>
      <div className="row">
        <label htmlFor="atl-qty">Aantal</label>
        <input
          id="atl-qty"
          type="number"
          min={1}
          max={99}
          style={{ width: 90 }}
          value={quantity}
          onChange={(event) => {
            setQuantity(Number(event.target.value) || 1);
          }}
        />
      </div>
    </Modal>
  );
}
