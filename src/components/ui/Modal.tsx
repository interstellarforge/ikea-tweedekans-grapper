"use client";

import { useEffect, useRef } from "react";

import { Icon } from "./Icon.tsx";

/** Native <dialog> shown modally; `onClose` fires for Escape, backdrop-less close and the X. */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon"
          title="Sluiten"
          aria-label="Sluiten"
          onClick={() => {
            ref.current?.close();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="body">{children}</div>
      {footer ? <div className="foot">{footer}</div> : null}
    </dialog>
  );
}
