"use client";

import "../profile.css";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, send } from "@/lib/api-client.ts";

const MIN_PASSWORD = 8;

export function ProfilePage({ email }: { email: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean }>({
    text: "",
    error: false,
  });

  const save = async () => {
    if (next !== again) {
      setMessage({
        text: "De nieuwe wachtwoorden komen niet overeen",
        error: true,
      });
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setMessage({ text: "Nieuw wachtwoord: minimaal 8 tekens", error: true });
      return;
    }
    try {
      await send("/api/profile/password", "PUT", { current, next });
      setCurrent("");
      setNext("");
      setAgain("");
      setMessage({ text: "Wachtwoord gewijzigd", error: false });
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    }
  };

  const logout = async () => {
    await send("/api/logout", "POST");
    router.push("/login");
    router.refresh();
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        type="password"
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => {
          set(event.target.value);
        }}
      />
    </div>
  );

  return (
    <main className="profile-page">
      <h1>Profiel</h1>
      <section className="panel">
        <div className="who">
          <div className="big-avatar">{email.charAt(0).toUpperCase()}</div>
          <div>
            <strong>{email}</strong>
            <div className="hint">Ingelogd</div>
          </div>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => void logout()}
        >
          Uitloggen
        </button>
      </section>

      <section className="panel">
        <h2>Wachtwoord wijzigen</h2>
        <p className="hint">
          Het nieuwe wachtwoord vervangt je huidige wachtwoord. Andere sessies
          worden uitgelogd.
        </p>
        {field(
          "current",
          "Huidig wachtwoord",
          current,
          setCurrent,
          "current-password",
        )}
        {field(
          "next",
          "Nieuw wachtwoord (min. 8 tekens)",
          next,
          setNext,
          "new-password",
        )}
        {field(
          "again",
          "Herhaal nieuw wachtwoord",
          again,
          setAgain,
          "new-password",
        )}
        <div className="row">
          <button type="button" onClick={() => void save()}>
            Wachtwoord opslaan
          </button>
          <span className={message.error ? "err" : "hint"}>{message.text}</span>
        </div>
      </section>
    </main>
  );
}
