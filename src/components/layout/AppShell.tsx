"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark, Icon, type IconName } from "@/components/ui/Icon.tsx";
import { onAlertsChanged } from "@/lib/alerts-events.ts";
import { api, send } from "@/lib/api-client.ts";

type NavItem = { href: string; label: string };
type MenuItem = NavItem & { icon: IconName };

const NAV: NavItem[] = [
  { href: "/watchlist", label: "Lijsten" },
  { href: "/catalog", label: "Producten" },
  { href: "/tweedekans", label: "Aanbod" },
  { href: "/trips", label: "Ritje-check" },
];

const MENU: MenuItem[] = [
  { href: "/alerts", label: "Meldingen", icon: "bell" },
  { href: "/settings", label: "Instellingen", icon: "sliders" },
  { href: "/profile", label: "Profiel", icon: "user" },
];

const ADMIN_ITEM: MenuItem = {
  href: "/admin",
  label: "Beheer",
  icon: "shield",
};
const ALERT_REFRESH_MS = 60_000;

export function AppShell({
  email,
  isAdmin,
  children,
}: {
  email: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ unseen: number }>("/api/alerts?limit=1");
      setUnseen(data.unseen);
    } catch {
      /* the badge is best effort */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, ALERT_REFRESH_MS);
    const stop = onAlertsChanged(() => {
      void refresh();
    });
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [refresh]);

  useEffect(() => {
    const close = (event: Event) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setNavOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNavOpen(false);
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const menuItems = isAdmin ? [...MENU, ADMIN_ITEM] : MENU;
  const inMenu = menuItems.some((item) => pathname.startsWith(item.href));
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const closeAll = () => {
    setMenuOpen(false);
    setNavOpen(false);
  };

  const logout = async () => {
    await send("/api/logout", "POST");
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <header ref={headerRef} className={navOpen ? "shell nav-open" : "shell"}>
        <div className="inner">
          <Link className="brand" href="/" title="Tweedekanshoek">
            <BrandMark />
            <span>Tweedekanshoek</span>
          </Link>
          <nav aria-label="Hoofdmenu">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : ""}
                onClick={closeAll}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="profile">
            <button
              type="button"
              className={inMenu ? "avatar active" : "avatar"}
              aria-label="Profiel en menu"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              <span>{email.charAt(0).toUpperCase()}</span>
              {unseen > 0 ? <span className="count">{unseen}</span> : null}
            </button>
            {menuOpen ? (
              <div className="menu" role="menu">
                <div className="menu-who" title={email}>
                  {email}
                </div>
                {menuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      isActive(item.href) ? "menu-item active" : "menu-item"
                    }
                    onClick={closeAll}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    {item.href === "/alerts" && unseen > 0 ? (
                      <span className="count">{unseen}</span>
                    ) : null}
                  </Link>
                ))}
                <hr />
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => void logout()}
                >
                  <Icon name="logout" />
                  Uitloggen
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="burger"
            aria-label={navOpen ? "Menu sluiten" : "Menu openen"}
            aria-expanded={navOpen}
            onClick={() => {
              setNavOpen((open) => !open);
            }}
          >
            <Icon name={navOpen ? "close" : "menu"} />
          </button>
        </div>
      </header>
      {children}
      <footer className="site-foot">
        Tweedekanshoek is een onofficieel project en niet gelieerd aan,
        gesponsord door of goedgekeurd door IKEA. Reserveren en kopen doe je
        altijd bij IKEA zelf.
      </footer>
    </>
  );
}
