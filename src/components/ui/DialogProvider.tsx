"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AddToListDialog, type ListProductInput } from "./AddToListDialog.tsx";
import { Modal } from "./Modal.tsx";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
};

type PromptOptions = {
  title: string;
  label: string;
  value?: string;
  confirmText?: string;
  placeholder?: string;
};

type Dialogs = {
  /** Custom replacement for window.confirm. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Custom replacement for window.prompt; resolves to the text, or undefined when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | undefined>;
  addToList: (product: ListProductInput) => void;
};

type Active =
  | { kind: "confirm"; options: ConfirmOptions }
  | { kind: "prompt"; options: PromptOptions }
  | { kind: "addToList"; product: ListProductInput };

const DialogContext = createContext<Dialogs | undefined>(undefined);

export function useDialogs(): Dialogs {
  const value = use(DialogContext);
  if (!value) throw new Error("useDialogs needs a DialogProvider");
  return value;
}

function ConfirmBody({
  options,
  settle,
}: {
  options: ConfirmOptions;
  settle: (value: boolean) => void;
}) {
  return (
    <Modal
      title={options.title}
      onClose={() => {
        settle(false);
      }}
      footer={
        <>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              settle(false);
            }}
          >
            Annuleren
          </button>
          <button
            type="button"
            className={options.danger === false ? "" : "danger"}
            onClick={() => {
              settle(true);
            }}
          >
            {options.confirmText ?? "Verwijderen"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{options.message}</p>
    </Modal>
  );
}

function PromptBody({
  options,
  settle,
}: {
  options: PromptOptions;
  settle: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(options.value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const value = text.trim();
    if (value) settle(value);
  };
  return (
    <Modal
      title={options.title}
      onClose={() => {
        settle(undefined);
      }}
      footer={
        <>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              settle(undefined);
            }}
          >
            Annuleren
          </button>
          <button type="button" onClick={submit}>
            {options.confirmText ?? "Opslaan"}
          </button>
        </>
      }
    >
      <label
        htmlFor="prompt-input"
        style={{ display: "block", marginBottom: 8 }}
      >
        {options.label}
      </label>
      <input
        id="prompt-input"
        type="text"
        style={{ width: "100%" }}
        value={text}
        placeholder={options.placeholder ?? ""}
        ref={inputRef}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
    </Modal>
  );
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Active | undefined>(undefined);
  const resolverRef = useRef<((value: never) => void) | undefined>(undefined);

  const open = useCallback(
    <T,>(next: Active): Promise<T> =>
      new Promise<T>((resolve) => {
        resolverRef.current = resolve;
        setActive(next);
      }),
    [],
  );

  const settle = useCallback((value: unknown) => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setActive(undefined);
    resolve?.(value as never);
  }, []);

  const value = useMemo<Dialogs>(
    () => ({
      confirm: (options) => open<boolean>({ kind: "confirm", options }),
      prompt: (options) =>
        open<string | undefined>({ kind: "prompt", options }),
      addToList: (product) => {
        setActive({ kind: "addToList", product });
      },
    }),
    [open],
  );

  return (
    <DialogContext value={value}>
      {children}
      {active?.kind === "confirm" ? (
        <ConfirmBody options={active.options} settle={settle} />
      ) : null}
      {active?.kind === "prompt" ? (
        <PromptBody options={active.options} settle={settle} />
      ) : null}
      {active?.kind === "addToList" ? (
        <AddToListDialog
          product={active.product}
          onClose={() => {
            setActive(undefined);
          }}
        />
      ) : null}
    </DialogContext>
  );
}
