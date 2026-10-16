"use client";

import { useState } from "react";

import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import type { PublicGlobalSettings } from "@/server/settings.ts";

type Flash = { text: string; error: boolean };

const CHANNEL_FIELDS = [
  { key: "ntfy", label: "Push (ntfy)" },
  { key: "email", label: "E-mail" },
  { key: "homeAssistant", label: "Home Assistant" },
  { key: "app", label: "App (push)" },
] as const;

type Smtp = {
  host: string;
  port: string;
  secure: string;
  user: string;
  password: string;
  from: string;
};

export function NotificationTypesTab() {
  const { data, reload } = useApiData<PublicGlobalSettings>(
    "/api/admin/settings",
  );
  return data ? <TypesEditor data={data} reload={reload} /> : null;
}

function TypesEditor({
  data,
  reload,
}: {
  data: PublicGlobalSettings;
  reload: () => Promise<void>;
}) {
  const [channels, setChannels] = useState({ ...data.channels });
  const [smtp, setSmtp] = useState<Smtp>({
    host: data.smtp.host,
    port: String(data.smtp.port),
    secure: String(data.smtp.secure),
    user: data.smtp.user,
    password: "",
    from: data.smtp.from,
  });
  const [saveMessage, setSaveMessage] = useState<Flash>({
    text: "",
    error: false,
  });
  const [smtpMessage, setSmtpMessage] = useState<Flash>({
    text: "",
    error: false,
  });

  const smtpPayload = () => ({
    host: smtp.host,
    port: Number(smtp.port),
    secure: smtp.secure === "true",
    user: smtp.user,
    password: smtp.password,
    from: smtp.from,
  });

  const save = async () => {
    try {
      await send("/api/admin/settings", "PUT", {
        channels,
        smtp: smtpPayload(),
      });
      await reload();
      setSaveMessage({ text: "Opgeslagen", error: false });
    } catch (error) {
      setSaveMessage({ text: errorMessage(error), error: true });
    }
  };

  const testSmtp = async () => {
    setSmtpMessage({ text: "Versturen…", error: false });
    try {
      await send("/api/admin/settings", "PUT", { smtp: smtpPayload() });
      await send("/api/admin/smtp-test", "POST");
      setSmtpMessage({ text: "Verstuurd — controleer je inbox", error: false });
    } catch (error) {
      setSmtpMessage({ text: errorMessage(error), error: true });
    }
  };

  const patchSmtp = (changes: Partial<Smtp>) => {
    setSmtp((current) => ({ ...current, ...changes }));
  };

  return (
    <div>
      <details className="channel" open>
        <summary>Meldingstypes</summary>
        <div className="body">
          <p className="hint">
            Een uitgezet type is voor gebruikers niet zichtbaar en wordt ook
            niet meer verstuurd.
          </p>
          {CHANNEL_FIELDS.map((c) => (
            <div className="field" key={c.key}>
              <label htmlFor={`ch-${c.key}`}>{c.label}</label>
              <span>
                <input
                  type="checkbox"
                  id={`ch-${c.key}`}
                  checked={channels[c.key]}
                  onChange={(event) => {
                    setChannels({ ...channels, [c.key]: event.target.checked });
                  }}
                />
                <label htmlFor={`ch-${c.key}`}>
                  Beschikbaar voor gebruikers
                </label>
              </span>
            </div>
          ))}
          <p className="hint">
            {data.ntfyConfigured
              ? "Elke gebruiker krijgt een eigen, niet aan te passen ntfy-topic onder de server uit NTFY_BASE_URL."
              : "NTFY_BASE_URL is niet ingesteld: ntfy-meldingen kunnen niet worden verstuurd."}
          </p>
        </div>
      </details>
      <details className="channel" open>
        <summary>E-mailserver (SMTP)</summary>
        <div className="body">
          <p className="hint">
            Wordt gebruikt voor e-mailmeldingen aan gebruikers. Gmail: gebruik
            een app-wachtwoord (smtp.gmail.com, poort 465, SSL/TLS).
          </p>
          <div className="field">
            <label htmlFor="smtpHost">Server</label>
            <input
              type="text"
              id="smtpHost"
              placeholder="smtp.gmail.com"
              value={smtp.host}
              onChange={(event) => {
                patchSmtp({ host: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="smtpPort">Poort</label>
            <input
              type="number"
              id="smtpPort"
              min={1}
              max={65535}
              value={smtp.port}
              onChange={(event) => {
                patchSmtp({ port: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="smtpSecure">Versleuteling</label>
            <select
              id="smtpSecure"
              value={smtp.secure}
              onChange={(event) => {
                patchSmtp({ secure: event.target.value });
              }}
            >
              <option value="true">SSL/TLS (poort 465)</option>
              <option value="false">STARTTLS (poort 587)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="smtpUser">Gebruikersnaam</label>
            <input
              type="text"
              id="smtpUser"
              autoComplete="off"
              value={smtp.user}
              onChange={(event) => {
                patchSmtp({ user: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="smtpPassword">Wachtwoord</label>
            <input
              type="password"
              id="smtpPassword"
              autoComplete="new-password"
              placeholder={data.smtp.passwordSet ? "•••••••• (opgeslagen)" : ""}
              value={smtp.password}
              onChange={(event) => {
                patchSmtp({ password: event.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="smtpFrom">Afzender</label>
            <input
              type="text"
              id="smtpFrom"
              placeholder="leeg = gebruikersnaam"
              value={smtp.from}
              onChange={(event) => {
                patchSmtp({ from: event.target.value });
              }}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="secondary"
              onClick={() => void testSmtp()}
            >
              Testmail naar mezelf
            </button>
            <span className={smtpMessage.error ? "err" : "hint"}>
              {smtpMessage.text}
            </span>
          </div>
        </div>
      </details>
      <div className="row">
        <button type="button" onClick={() => void save()}>
          Opslaan
        </button>
        <span className={saveMessage.error ? "err" : "hint"}>
          {saveMessage.text}
        </span>
      </div>
    </div>
  );
}
