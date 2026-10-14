const EVENT = "tweedekanshoek:alerts-changed";

/** Tells the app shell to re-read the unseen-alerts badge. */
export function notifyAlertsChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onAlertsChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener(EVENT, listener);
  };
}
