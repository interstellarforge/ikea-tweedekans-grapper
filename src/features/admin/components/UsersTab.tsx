"use client";

import { useDialogs } from "@/components/ui/DialogProvider.tsx";
import { useApiData } from "@/hooks/useApiData.ts";
import { errorMessage, send } from "@/lib/api-client.ts";
import { dateTime } from "@/lib/format.ts";

type AdminUser = {
  id: number;
  email: string;
  role: "user" | "admin";
  active: boolean;
  createdAt: number;
  lastLogin: number | undefined;
};

const MIN_PASSWORD = 8;

export function UsersTab({ currentUserId }: { currentUserId: number }) {
  const dialogs = useDialogs();
  const settings = useApiData<{ registrationOpen: boolean }>(
    "/api/admin/settings",
  );
  const users = useApiData<AdminUser[]>("/api/admin/users");
  const { reload: reloadSettings } = settings;
  const { reload: reloadUsers } = users;

  const notify = (title: string, message: string) =>
    dialogs.confirm({ title, message, confirmText: "OK", danger: false });

  const run = async (request: Promise<unknown>) => {
    try {
      await request;
    } catch (error) {
      await notify("Niet gelukt", errorMessage(error));
    }
    await reloadUsers();
  };

  const setRegistration = async (open: boolean) => {
    await send("/api/admin/settings", "PUT", { registrationOpen: open });
    await reloadSettings();
  };

  const resetPassword = async (user: AdminUser) => {
    const password = await dialogs.prompt({
      title: `Nieuw wachtwoord voor ${user.email}`,
      label: `Nieuw wachtwoord (min. ${String(MIN_PASSWORD)} tekens)`,
      confirmText: "Instellen",
    });
    if (!password) return;
    try {
      await send(`/api/admin/users/${String(user.id)}/password`, "POST", {
        password,
      });
      await notify(
        "Wachtwoord gewijzigd",
        `Geef het nieuwe wachtwoord door aan ${user.email}.`,
      );
    } catch (error) {
      await notify("Niet gelukt", errorMessage(error));
    }
  };

  const remove = async (user: AdminUser) => {
    const ok = await dialogs.confirm({
      title: "Gebruiker verwijderen",
      message: `${user.email} en alle gegevens (watchlist, lijsten, meldingen) definitief verwijderen?`,
    });
    if (!ok) return;
    await run(send(`/api/admin/users/${String(user.id)}`, "DELETE"));
  };

  const list = users.data ?? [];
  const actions = (u: AdminUser) => {
    const self = u.id === currentUserId;
    return (
      <div className="actions">
        <button
          type="button"
          className="secondary mini"
          onClick={() => {
            void run(
              send(`/api/admin/users/${String(u.id)}`, "PUT", {
                role: u.role === "admin" ? "user" : "admin",
              }),
            );
          }}
        >
          {u.role === "admin" ? "Geen beheerder" : "Maak beheerder"}
        </button>
        <button
          type="button"
          className="secondary mini"
          disabled={self && u.active}
          onClick={() => {
            void run(
              send(`/api/admin/users/${String(u.id)}`, "PUT", {
                active: !u.active,
              }),
            );
          }}
        >
          {u.active ? "Deactiveren" : "Activeren"}
        </button>
        <button
          type="button"
          className="secondary mini"
          onClick={() => void resetPassword(u)}
        >
          Wachtwoord
        </button>
        <button
          type="button"
          className="secondary mini"
          disabled={self}
          onClick={() => void remove(u)}
        >
          Verwijderen
        </button>
      </div>
    );
  };
  const role = (u: AdminUser) => (
    <span
      className={`role ${!u.active ? "off" : u.role === "admin" ? "admin" : ""}`}
    >
      {!u.active
        ? "uitgeschakeld"
        : u.role === "admin"
          ? "beheerder"
          : "gebruiker"}
    </span>
  );

  return (
    <div>
      <details className="channel" open>
        <summary>Registratie</summary>
        <div className="body">
          <div className="field">
            <label htmlFor="regOpen">Nieuwe accounts</label>
            <span>
              <input
                type="checkbox"
                id="regOpen"
                checked={settings.data?.registrationOpen ?? true}
                onChange={(event) => {
                  void setRegistration(event.target.checked);
                }}
              />
              <label htmlFor="regOpen">
                Iedereen mag zelf een account maken
              </label>
            </span>
          </div>
        </div>
      </details>
      <details className="channel" open>
        <summary>
          Gebruikers <span className="state">{String(list.length)}</span>
        </summary>
        <div className="body">
          <div className="table-scroll">
            <table className="users">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Rol</th>
                  <th>Aangemaakt</th>
                  <th>Laatst ingelogd</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{role(u)}</td>
                    <td>{dateTime(u.createdAt)}</td>
                    <td>{dateTime(u.lastLogin)}</td>
                    <td>{actions(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            {list.map((u) => (
              <div className="user-card" key={u.id}>
                <strong>{u.email}</strong> {role(u)}
                <div className="meta">{`Aangemaakt ${dateTime(u.createdAt)} · laatst ingelogd ${dateTime(u.lastLogin)}`}</div>
                {actions(u)}
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
