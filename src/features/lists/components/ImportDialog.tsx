"use client";

import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/ui/Modal.tsx";
import { errorMessage, send } from "@/lib/api-client.ts";

type ParsedItem = { articleNumber: string; quantity: number };
type AddResult = { status: string; name: string };
type RowState = {
  item: ParsedItem;
  label: string;
  status: string;
  tone: "" | "running" | "ok" | "warn" | "err";
};

const STATUS_TEXT: Record<string, string> = {
  added: "toegevoegd",
  updated: "aantal bijgewerkt",
  unchanged: "stond er al",
  unknown: "alleen artikelnummer (niet gevonden)",
};

/** Imports a pasted text list into one shopping list, with progress per line. */
export function ImportDialog({
  listId,
  onClose,
}: {
  listId: number;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<RowState[] | undefined>(undefined);
  const [summary, setSummary] = useState("");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);
  const done =
    rows?.filter(
      (r) => r.tone === "ok" || r.tone === "warn" || r.tone === "err",
    ).length ?? 0;

  const patchRow = (index: number, patch: Partial<RowState>) => {
    setRows((current) =>
      current?.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const start = async () => {
    setMessage("");
    let parsed: ParsedItem[];
    try {
      parsed = (
        await send<{ items: ParsedItem[] }>("/api/list/parse", "POST", { text })
      ).items;
    } catch (error) {
      setMessage(errorMessage(error));
      return;
    }
    if (parsed.length === 0) {
      setMessage("Geen artikelnummers gevonden");
      return;
    }
    setRunning(true);
    setRows(
      parsed.map((item) => ({
        item,
        label: `${String(item.quantity)}× ${item.articleNumber}`,
        status: "wacht…",
        tone: "",
      })),
    );
    const counts: Record<string, number> = {};
    for (const [index, item] of parsed.entries()) {
      patchRow(index, { tone: "running", status: "opzoeken…" });
      try {
        const result = await send<AddResult>(
          `/api/lists/${String(listId)}/items`,
          "POST",
          {
            articleNumber: item.articleNumber,
            quantity: item.quantity,
            mode: "max",
          },
        );
        counts[result.status] = (counts[result.status] ?? 0) + 1;
        patchRow(index, {
          label: `${String(item.quantity)}× ${result.name}`,
          status: STATUS_TEXT[result.status] ?? result.status,
          tone: result.status === "unknown" ? "warn" : "ok",
        });
      } catch (error) {
        counts["failed"] = (counts["failed"] ?? 0) + 1;
        patchRow(index, {
          status: `mislukt: ${errorMessage(error)}`,
          tone: "err",
        });
      }
    }
    setSummary(
      `Klaar: ${String(counts["added"] ?? 0)} toegevoegd, ${String(counts["updated"] ?? 0)} bijgewerkt, ${String(counts["unchanged"] ?? 0)} ongewijzigd` +
        (counts["unknown"] ? `, ${String(counts["unknown"])} onbekend` : "") +
        (counts["failed"] ? `, ${String(counts["failed"])} mislukt` : ""),
    );
    setRunning(false);
    setFinished(true);
  };

  const close = () => {
    if (!running) onClose();
  };

  return (
    <Modal
      title="Importeren"
      onClose={close}
      footer={
        <>
          <span className="err">{message}</span>
          {finished ? null : (
            <button
              type="button"
              className="secondary"
              disabled={running}
              onClick={close}
            >
              Annuleren
            </button>
          )}
          <button
            type="button"
            disabled={running}
            onClick={() => {
              if (finished) onClose();
              else void start();
            }}
          >
            {finished ? "Sluiten" : "Toevoegen"}
          </button>
        </>
      }
    >
      {rows === undefined ? (
        <>
          <p className="hint">
            Eén product per regel met het artikelnummer (met of zonder punten),
            optioneel met aantal: <code>2x 802.045.62</code>,{" "}
            <code>90591705 x3</code>, <code>10557036 4 stuks</code>. Dezelfde
            lijst opnieuw importeren telt aantallen niet dubbel.
          </p>
          <textarea
            placeholder={"2x 802.045.62\n90591705 x3\n10557036"}
            ref={areaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </>
      ) : (
        <div>
          <div className="hint">
            {summary || `${String(done)} van ${String(rows.length)} verwerkt`}
          </div>
          <div className="bar ok">
            <span
              style={{
                width: `${String(Math.round((done / rows.length) * 100))}%`,
              }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            {rows.map((row, index) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- rows are positional and never reordered
              <div className="imp" key={index}>
                <div className="top">
                  <span>{row.label}</span>
                  <span className="meta">{row.status}</span>
                </div>
                <div className={row.tone ? `bar ${row.tone}` : "bar"}>
                  <span />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
