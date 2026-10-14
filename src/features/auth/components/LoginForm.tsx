"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

type AuthConfig = { registrationOpen: boolean; firstAccount: boolean };

export function LoginForm({ next }: { next: string | undefined }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const target = next && next !== "/" ? next : "/watchlist";

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/config", { signal: controller.signal })
      .then((r) => r.json() as Promise<AuthConfig>)
      .then((c) => {
        setRegistrationOpen(c.registrationOpen);
        if (c.firstAccount) window.location.replace("/register");
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, []);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!email || !password) {
      setMessage("Vul je e-mailadres en wachtwoord in.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = target;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? "Inloggen mislukt");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Inloggen</h1>
      <p className="lead">
        Welkom terug. Log in om je lijsten en meldingen te zien.
      </p>
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
        <label htmlFor="password">Wachtwoord</label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <button type="submit" disabled={busy}>
          Inloggen
        </button>
        <p className="err" role="alert">
          {message}
        </p>
      </form>
      {registrationOpen ? (
        <p className="alt">
          Nog geen account?{" "}
          <Link
            href={
              next ? `/register?next=${encodeURIComponent(next)}` : "/register"
            }
          >
            Account maken
          </Link>
        </p>
      ) : null}
    </>
  );
}
