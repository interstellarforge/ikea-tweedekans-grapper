import "../auth.css";

import Link from "next/link";

import { BrandMark, Icon, type IconName } from "@/components/ui/Icon.tsx";

const POINTS: { icon: IconName; text: string }[] = [
  {
    icon: "bell",
    text: "Melding zodra jouw product in een filiaal ligt dat je volgt.",
  },
  {
    icon: "route",
    text: "Ritje-check met brandstof, tijd en een route langs meerdere filialen.",
  },
  {
    icon: "shield",
    text: "Lijsten, aankopen en instellingen zijn alleen van jou.",
  },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link className="brand" href="/">
          <BrandMark />
          <span>Tweedekanshoek</span>
        </Link>
        <div>
          <h2>Alle tweedekanshoeken, één lijst.</h2>
          <ul>
            {POINTS.map((p) => (
              <li key={p.icon}>
                <Icon name={p.icon} />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="fine">Onofficieel project, niet gelieerd aan IKEA.</p>
      </aside>
      <div className="auth-main">
        <div className="auth-top">
          <Link className="brand" href="/">
            <BrandMark />
            <span>Tweedekanshoek</span>
          </Link>
          <Link className="back" href="/">
            Terug naar de startpagina
          </Link>
        </div>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
