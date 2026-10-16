"use client";

import { useState } from "react";

import { useDialogs } from "@/components/ui/DialogProvider.tsx";
import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import { dateTime } from "@/lib/format.ts";
import type { IpRule, IpVerdict } from "@/server/ips.ts";
import type { Traffic } from "@/server/stats.ts";

type TrafficResponse = { traffic: Traffic; rules: IpRule[]; yourIp: string };

const numberFormat = new Intl.NumberFormat("nl-NL");
const n = (value: number): string => numberFormat.format(value);

const CLIENT_LABEL: Record<string, string> = {
  app: "de app",
  bot: "bot/script",
  mobile: "mobiel",
  desktop: "desktop",
  other: "overig",
};

const VERDICT_LABEL: Record<IpVerdict, string> = {
  none: "",
  allow: "toegestaan",
  block: "geblokkeerd",
};

export function TrafficTab() {
  const dialogs = useDialogs();
  const { data, reload } = useApiData<TrafficResponse>("/api/admin/traffic");
  const [cidr, setCidr] = useState("");
  const [kind, setKind] = useState<"allow" | "block">("block");
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState("");
  const [days, setDays] = useState<string | undefined>();

  if (!data) return null;
  const { traffic, rules, yourIp } = data;

  const run = async (request: Promise<unknown>): Promise<boolean> => {
    try {
      await request;
      await reload();
      return true;
    } catch (error) {
      await dialogs.confirm({
        title: "Niet gelukt",
        message: errorMessage(error),
        confirmText: "OK",
        danger: false,
      });
      return false;
    }
  };

  const addRule = (
    rule: { cidr: string; kind: "allow" | "block" },
    extra: { note?: string; expiresAt?: number } = {},
  ) => send("/api/admin/ip-rules", "POST", { ...rule, ...extra });

  const submit = async () => {
    const expiresAt = expires
      ? new Date(`${expires}T23:59:59`).getTime()
      : undefined;
    const done = await run(
      addRule({ cidr, kind }, { note, ...(expiresAt ? { expiresAt } : {}) }),
    );
    if (done) {
      setCidr("");
      setNote("");
      setExpires("");
    }
  };

  const quickBlock = async (ip: string) => {
    const ok = await dialogs.confirm({
      title: "IP blokkeren",
      message: `${ip} blokkeren? Het adres krijgt geen toegang meer tot de site en de app.`,
    });
    if (ok)
      await run(
        addRule(
          { cidr: ip, kind: "block" },
          { note: "Geblokkeerd vanuit verkeersoverzicht" },
        ),
      );
  };

  const saveDays = async () => {
    if (days === undefined) return;
    if (
      await run(
        send("/api/admin/traffic", "PUT", { retentionDays: Number(days) }),
      )
    ) {
      setDays(undefined);
    }
  };

  const peak = Math.max(1, ...traffic.hours);

  return (
    <div>
      <details className="channel" open>
        <summary>Bezoekers</summary>
        <div className="body">
          <div className="stat-grid">
            {traffic.windows.map((w) => (
              <div className="stat" key={w.label}>
                <strong>{n(w.requests)}</strong>
                <span>{`${w.label}: verzoeken, ${n(w.ips)} unieke IP's`}</span>
              </div>
            ))}
            <div className="stat">
              <strong>{`${n(traffic.logins.ok24h)} / ${n(traffic.logins.failed24h)}`}</strong>
              <span>Logins geslaagd / mislukt (24 uur)</span>
            </div>
            <div className="stat">
              <strong>{`${n(traffic.logins.ok7d)} / ${n(traffic.logins.failed7d)}`}</strong>
              <span>Logins geslaagd / mislukt (7 dagen)</span>
            </div>
          </div>
          <h3>Drukte per uur van de dag</h3>
          <div
            className="hour-bars"
            role="img"
            aria-label="Verzoeken per uur van de dag"
          >
            {traffic.hours.map((count, hour) => (
              <div
                key={hour}
                className="hour-bar"
                title={`${String(hour)}:00 – ${n(count)} verzoeken`}
              >
                <span
                  style={{
                    height: `${String(Math.round((count / peak) * 100))}%`,
                  }}
                />
                <small>{hour % 3 === 0 ? String(hour) : ""}</small>
              </div>
            ))}
          </div>
          <h3>Per dag</h3>
          <div className="table-scroll">
            <table className="users">
              <thead>
                <tr>
                  <th>Dag</th>
                  <th>Verzoeken</th>
                  <th>Unieke IP&apos;s</th>
                  <th>Logins ok</th>
                  <th>Logins mislukt</th>
                  <th>Geweigerd</th>
                </tr>
              </thead>
              <tbody>
                {traffic.days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{n(d.requests)}</td>
                    <td>{n(d.uniqueIps)}</td>
                    <td>{n(d.loginsOk)}</td>
                    <td>{n(d.loginsFailed)}</td>
                    <td>{n(d.blocked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Bezoekers</h3>
          <div className="stat-grid">
            <div className="stat">
              <strong>{n(traffic.visitors.newIps24h)}</strong>
              <span>Nieuwe IP&apos;s (24 uur)</span>
            </div>
            <div className="stat">
              <strong>{n(traffic.visitors.returningIps24h)}</strong>
              <span>Terugkerende IP&apos;s (24 uur)</span>
            </div>
            {traffic.visitors.clients.map((c) => (
              <div className="stat" key={c.client}>
                <strong>{n(c.ips)}</strong>
                <span>{`IP's met ${CLIENT_LABEL[c.client] ?? c.client} (7 dagen)`}</span>
              </div>
            ))}
          </div>
          <h3>Populairste paden (7 dagen)</h3>
          <div className="table-scroll">
            <table className="users">
              <tbody>
                {traffic.paths.map((p) => (
                  <tr key={p.path}>
                    <td>{p.path}</td>
                    <td>{n(p.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Laatste activiteit per gebruiker</h3>
          <div className="table-scroll">
            <table className="users">
              <tbody>
                {traffic.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{dateTime(u.lastSeen)}</td>
                    <td>{u.lastIp ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>
          Beveiligingsmeldingen{" "}
          <span className="state">{String(traffic.alerts.length)}</span>
        </summary>
        <div className="body">
          <p className="hint">
            Je krijgt een melding (via je eigen meldingskanalen) bij 10+
            mislukte logins in 15 minuten, 5+ afgewezen verzoeken door de rate
            limit in 10 minuten, of een IP dat 50+ API-verzoeken per uur doet
            zonder ooit een pagina te openen. Max. 1 melding per soort en IP per
            uur.
          </p>
          <div className="field">
            <label htmlFor="alertsOn">Meldingen</label>
            <span>
              <input
                type="checkbox"
                id="alertsOn"
                checked={traffic.alertsEnabled}
                onChange={(e) => {
                  void run(
                    send("/api/admin/traffic", "PUT", {
                      alertsEnabled: e.target.checked,
                    }),
                  );
                }}
              />
              <label htmlFor="alertsOn">Stuur mij beveiligingsmeldingen</label>
            </span>
          </div>
          <div className="table-scroll">
            <table className="users">
              <tbody>
                {traffic.alerts.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.ts)}</td>
                    <td>{a.ip}</td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>
          IP-adressen (7 dagen){" "}
          <span className="state">{`jij: ${yourIp}`}</span>
        </summary>
        <div className="body">
          <div className="table-scroll">
            <table className="users">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Verzoeken</th>
                  <th>Mislukte logins</th>
                  <th>Geweigerd</th>
                  <th>Laatst gezien</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {traffic.ips.map((r) => (
                  <tr key={r.ip}>
                    <td>
                      {r.ip}{" "}
                      {r.verdict === "none" ? null : (
                        <span
                          className={`role ${r.verdict === "block" ? "off" : "admin"}`}
                        >
                          {VERDICT_LABEL[r.verdict]}
                        </span>
                      )}
                      {r.apiOnly ? (
                        <span className="role off">alleen API</span>
                      ) : null}
                    </td>
                    <td>{n(r.requests)}</td>
                    <td>{n(r.failedLogins)}</td>
                    <td>{n(r.blocked)}</td>
                    <td>{dateTime(r.lastSeen)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary mini"
                        disabled={
                          r.ip === yourIp ||
                          r.ip === "unknown" ||
                          r.verdict === "block"
                        }
                        onClick={() => void quickBlock(r.ip)}
                      >
                        Blokkeer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>
          IP-regels <span className="state">{String(rules.length)}</span>
        </summary>
        <div className="body">
          <p className="hint">
            Een IP-adres of CIDR-bereik (bijv. 203.0.113.0/24). Toestaan wint
            van blokkeren en slaat ook de inlogbeveiliging (te veel foute
            pogingen) over. Het IP komt uit de laatste proxy in x-forwarded-for
            (TRUSTED_PROXY_HOPS).
          </p>
          <div className="field">
            <label htmlFor="ipCidr">IP / bereik</label>
            <input
              id="ipCidr"
              value={cidr}
              onChange={(e) => {
                setCidr(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="ipKind">Type</label>
            <select
              id="ipKind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value === "allow" ? "allow" : "block");
              }}
            >
              <option value="block">Blokkeren</option>
              <option value="allow">Toestaan</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ipNote">Reden</label>
            <input
              id="ipNote"
              value={note}
              maxLength={200}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="ipExpires">Verloopt op</label>
            <input
              id="ipExpires"
              type="date"
              value={expires}
              onChange={(e) => {
                setExpires(e.target.value);
              }}
            />
          </div>
          <div className="row">
            <button
              type="button"
              disabled={!cidr.trim()}
              onClick={() => void submit()}
            >
              Toevoegen
            </button>
          </div>
          <div className="table-scroll">
            <table className="users">
              <thead>
                <tr>
                  <th>Bereik</th>
                  <th>Type</th>
                  <th>Reden</th>
                  <th>Verloopt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.cidr}</td>
                    <td>{r.kind === "block" ? "Geblokkeerd" : "Toegestaan"}</td>
                    <td>{r.note}</td>
                    <td>{r.expiresAt ? dateTime(r.expiresAt) : "nooit"}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary mini"
                        onClick={() =>
                          void run(
                            send(
                              `/api/admin/ip-rules/${String(r.id)}`,
                              "DELETE",
                            ),
                          )
                        }
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <details className="channel">
        <summary>Bewaartermijn</summary>
        <div className="body">
          <p className="hint">
            Ruwe IP-logs worden na deze termijn verwijderd; daarna blijven
            alleen totalen per dag over.
          </p>
          <div className="field">
            <label htmlFor="logDays">Dagen bewaren</label>
            <input
              id="logDays"
              type="number"
              min={1}
              max={365}
              value={days ?? String(traffic.retentionDays)}
              onChange={(e) => {
                setDays(e.target.value);
              }}
            />
          </div>
          <div className="row">
            <button
              type="button"
              disabled={days === undefined}
              onClick={() => void saveDays()}
            >
              Opslaan
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
