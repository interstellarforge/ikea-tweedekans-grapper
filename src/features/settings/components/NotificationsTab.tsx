"use client";

import { useEffect, useState } from "react";

import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import { dateTime } from "@/lib/format.ts";
import type { Device } from "@/server/devices.ts";

import type { SettingsDraft, SettingsView } from "./SettingsPage.tsx";

type Flash = { text: string; error: boolean };
const NONE: Flash = { text: "", error: false };

function State({ on }: { on: boolean }) {
  return (
    <span className={on ? "state on" : "state"}>{on ? "aan" : "uit"}</span>
  );
}

function Message({ flash }: { flash: Flash }) {
  return <span className={flash.error ? "err" : "hint"}>{flash.text}</span>;
}

export function NotificationsTab({
  settings,
  draft,
  patch,
  save,
}: {
  settings: SettingsView;
  draft: SettingsDraft;
  patch: (changes: Partial<SettingsDraft>) => void;
  save: () => Promise<void>;
}) {
  const ch = settings.channels;
  const [available, setAvailable] = useState<string[]>([]);
  const [flash, setFlash] = useState<Record<string, Flash>>({});

  const say = (key: string, text: string, error = false) => {
    setFlash((current) => ({ ...current, [key]: { text, error } }));
  };

  useEffect(() => {
    const ha = settings.homeAssistant;
    if (!ha.tokenSet || !ha.baseUrl) return;
    void send<{ targets: string[] }>("/api/ha/targets", "POST", {})
      .then(({ targets }) => {
        setAvailable(targets);
      })
      .catch((error: unknown) => {
        say("ha", errorMessage(error), true);
      });
  }, [settings.homeAssistant]);

  const test = async (channel: string, key: string) => {
    say(key, "Versturen…");
    try {
      await save();
      await send(`/api/notify/test/${channel}`, "POST");
      say(key, "Verstuurd — controleer je telefoon of inbox");
    } catch (error) {
      say(key, errorMessage(error), true);
    }
  };

  const fetchTargets = async () => {
    say("ha", "Verbinden…");
    try {
      const { targets } = await send<{ targets: string[] }>(
        "/api/ha/targets",
        "POST",
        { baseUrl: draft.haUrl, token: draft.haToken },
      );
      setAvailable(targets);
      say("ha", `Verbonden — ${String(targets.length)} ontvangers gevonden`);
    } catch (error) {
      say("ha", errorMessage(error), true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(settings.ntfyUrl);
      say("ntfy", "Gekopieerd");
    } catch {
      say("ntfy", "Selecteer en kopieer het adres handmatig", true);
    }
  };

  const targets = [...new Set([...available, ...draft.haTargets])].sort();
  const toggleTarget = (name: string, on: boolean) => {
    patch({
      haTargets: on
        ? [...draft.haTargets, name]
        : draft.haTargets.filter((t) => t !== name),
    });
  };
  const devices = useApiData<{ devices: Device[] }>("/api/devices");
  const noneVisible =
    !ch.ntfy.visible &&
    !ch.email.visible &&
    !ch.homeAssistant.visible &&
    !ch.app.visible;

  return (
    <div>
      {noneVisible ? (
        <p className="hint">
          De beheerder heeft op dit moment geen meldingstypes ingeschakeld.
        </p>
      ) : null}

      {ch.app.visible ? (
        <details className="channel" open>
          <summary>
            App (push) <State on={draft.notify.app && ch.app.configured} />
          </summary>
          <div className="body">
            <div className="field">
              <label htmlFor="appOn">Meldingen in de Android-app</label>
              <span>
                <input
                  type="checkbox"
                  id="appOn"
                  checked={draft.notify.app}
                  onChange={(event) => {
                    patch({
                      notify: { ...draft.notify, app: event.target.checked },
                    });
                  }}
                />
                <label htmlFor="appOn">Ingeschakeld</label>
              </span>
            </div>
            <p className="hint">
              Log in met je e-mailadres en wachtwoord in de app. Apparaten die
              ingelogd zijn staan hieronder; verwijder een apparaat om het uit
              te loggen.
            </p>
            {(devices.data?.devices ?? []).map((d) => (
              <div className="row" key={d.id}>
                <span>
                  <strong>{d.name}</strong>
                  <span className="meta">{` · laatst gebruikt ${dateTime(d.lastUsed)}${d.pushEnabled ? " · meldingen aan" : ""}`}</span>
                </span>
                <button
                  type="button"
                  className="secondary mini"
                  onClick={() => {
                    void send(`/api/devices/${String(d.id)}`, "DELETE").then(
                      devices.reload,
                    );
                  }}
                >
                  Uitloggen
                </button>
              </div>
            ))}
            {devices.data?.devices.length === 0 ? (
              <p className="hint">Nog geen apparaten.</p>
            ) : null}
            {ch.app.configured ? (
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void test("app", "app")}
                >
                  Testmelding versturen
                </button>
                <Message flash={flash["app"] ?? NONE} />
              </div>
            ) : (
              <p className="hint">
                Meldingen werken zodra de beheerder FCM heeft ingesteld en je de
                app hebt geopend.
              </p>
            )}
          </div>
        </details>
      ) : null}

      {ch.ntfy.visible ? (
        <details className="channel" open>
          <summary>
            Push (ntfy) <State on={draft.notify.ntfy && ch.ntfy.configured} />
          </summary>
          <div className="body">
            <div className="field">
              <label htmlFor="ntfyOn">Meldingen via ntfy</label>
              <span>
                <input
                  type="checkbox"
                  id="ntfyOn"
                  checked={draft.notify.ntfy}
                  onChange={(event) => {
                    patch({
                      notify: { ...draft.notify, ntfy: event.target.checked },
                    });
                  }}
                />
                <label htmlFor="ntfyOn">Ingeschakeld</label>
              </span>
            </div>
            {ch.ntfy.configured ? (
              <div>
                <p className="hint">
                  Abonneer je in de ntfy-app op dit persoonlijke adres (server
                  en topic). Het adres is voor jou aangemaakt en niet aan te
                  passen.
                </p>
                <div className="copy-row">
                  <input
                    type="text"
                    readOnly
                    value={settings.ntfyUrl}
                    aria-label="ntfy-adres"
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void copy()}
                  >
                    Kopiëren
                  </button>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void test("ntfy", "ntfy")}
                  >
                    Testmelding versturen
                  </button>
                  <Message flash={flash["ntfy"] ?? NONE} />
                </div>
              </div>
            ) : (
              <p className="hint">
                De beheerder heeft nog geen ntfy-server ingesteld.
              </p>
            )}
          </div>
        </details>
      ) : null}

      {ch.email.visible ? (
        <details className="channel">
          <summary>
            E-mail <State on={draft.notify.email && ch.email.configured} />
          </summary>
          <div className="body">
            <div className="field">
              <label htmlFor="mailOn">Meldingen per e-mail</label>
              <span>
                <input
                  type="checkbox"
                  id="mailOn"
                  checked={draft.notify.email}
                  onChange={(event) => {
                    patch({
                      notify: { ...draft.notify, email: event.target.checked },
                    });
                  }}
                />
                <label htmlFor="mailOn">Ingeschakeld</label>
              </span>
            </div>
            <p className="hint">
              Meldingen worden gestuurd naar <strong>{settings.email}</strong>.
            </p>
            {ch.email.configured ? (
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void test("email", "email")}
                >
                  Testmail versturen
                </button>
                <Message flash={flash["email"] ?? NONE} />
              </div>
            ) : (
              <p className="hint">
                De beheerder heeft nog geen e-mailserver ingesteld.
              </p>
            )}
          </div>
        </details>
      ) : null}

      {ch.homeAssistant.visible ? (
        <details className="channel">
          <summary>
            Home Assistant{" "}
            <State
              on={draft.notify.homeAssistant && ch.homeAssistant.configured}
            />
          </summary>
          <div className="body">
            <div className="field">
              <label htmlFor="haOn">Meldingen via Home Assistant</label>
              <span>
                <input
                  type="checkbox"
                  id="haOn"
                  checked={draft.notify.homeAssistant}
                  onChange={(event) => {
                    patch({
                      notify: {
                        ...draft.notify,
                        homeAssistant: event.target.checked,
                      },
                    });
                  }}
                />
                <label htmlFor="haOn">Ingeschakeld</label>
              </span>
            </div>
            <div className="field">
              <label htmlFor="haUrl">Home Assistant-URL</label>
              <input
                type="url"
                id="haUrl"
                placeholder="http://homeassistant.local:8123"
                value={draft.haUrl}
                onChange={(event) => {
                  patch({ haUrl: event.target.value });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="haToken">Long-lived access token</label>
              <input
                type="password"
                id="haToken"
                autoComplete="new-password"
                placeholder={
                  settings.homeAssistant.tokenSet ? "•••••••• (opgeslagen)" : ""
                }
                value={draft.haToken}
                onChange={(event) => {
                  patch({ haToken: event.target.value });
                }}
              />
            </div>
            <p className="hint">
              Maak het token aan in Home Assistant: profiel → Beveiliging →
              Long-lived access tokens.
            </p>
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void fetchTargets()}
              >
                Verbinding testen &amp; ontvangers ophalen
              </button>
              <Message flash={flash["ha"] ?? NONE} />
            </div>
            <strong>Wie moet de melding krijgen?</strong>
            <div className="targets">
              {targets.length > 0 ? (
                targets.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={draft.haTargets.includes(name)}
                      onChange={(event) => {
                        toggleTarget(name, event.target.checked);
                      }}
                    />
                    {` ${name}${available.includes(name) ? "" : " (niet gevonden)"}`}
                  </label>
                ))
              ) : (
                <span className="hint">Nog geen ontvangers opgehaald.</span>
              )}
            </div>
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void test("ha", "haTest")}
              >
                Testmelding versturen
              </button>
              <Message flash={flash["haTest"] ?? NONE} />
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
