"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

type AuthConfig = { registrationOpen: boolean; firstAccount: boolean };

const MIN_PASSWORD = 8;

export function RegisterForm({ next }: { next: string | undefined }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AuthConfig>({
    registrationOpen: true,
    firstAccount: false,
  });
  const target = next ?? "/watchlist";

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/config", { signal: controller.signal })
      .then((r) => r.json() as Promise<AuthConfig>)
      .then(setConfig)
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, []);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setMessage("Vul een geldig e-mailadres in.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setMessage("Kies een wachtwoord van minimaal 8 tekens.");
      return;
    }
    if (password !== again) {
      setMessage("De wachtwoorden komen niet overeen.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, password }),
      });
      if (res.ok) {
        window.location.href = target;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? "Account maken mislukt");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Account maken</h1>
      <p className="lead">
        Gratis. Met e-mail en wachtwoord ben je binnen een minuut klaar.
      </p>
      {config.firstAccount ? (
        <p className="note">
          Er zijn nog geen accounts: dit eerste account wordt beheerder.
        </p>
      ) : null}
      {config.registrationOpen ? (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label htmlFor="email">E-mailadres</label>
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <label htmlFor="password">
            Wachtwoord <span className="hint">(minimaal 8 tekens)</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <label htmlFor="again">Herhaal wachtwoord</label>
          <input
            type="password"
            id="again"
            name="again"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            value={again}
            onChange={(event) => {
              setAgain(event.target.value);
            }}
          />
          <button type="submit" disabled={busy}>
            Account maken
          </button>
          <p className="err" role="alert">
            {message}
          </p>
        </form>
      ) : (
        <p className="note">
          Registreren is op dit moment uitgeschakeld. Vraag de beheerder om een
          account.
        </p>
      )}
      <p className="alt">
        Al een account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
        >
          Inloggen
        </Link>
      </p>
      <p className="hint" style={{ marginTop: 14, textAlign: "center" }}>
        Je gegevens zijn alleen van jou. Onofficieel project, niet gelieerd aan
        IKEA.
      </p>
    </>
  );
}
