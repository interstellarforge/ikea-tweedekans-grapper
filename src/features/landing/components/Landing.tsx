import "../landing.css";

import Link from "next/link";

import { money } from "@/lib/format.ts";
import type { Stat } from "@/server/stats.ts";

const numberFormat = new Intl.NumberFormat("nl-NL");

const formatStat = (s: Stat): string =>
  s.format === "eur"
    ? money(s.value).replace(/,00$/, "")
    : numberFormat.format(s.value);

export function Landing({ stats }: { stats: Stat[] }) {
  return (
    <div className="landing-page">
      <header className="site-head">
        <div className="wrap">
          <Link className="brand" href="/">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M2.5 16 12 4.5h15a2.5 2.5 0 0 1 2.5 2.5v18a2.5 2.5 0 0 1-2.5 2.5H12z"
                fill="#FFDB00"
              />
              <circle cx="11.5" cy="16" r="2.3" fill="#0058A3" />
              <path
                d="M17.5 12.5h7M17.5 16.5h7M17.5 20.5h4"
                stroke="#0058A3"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span>Tweedekanshoek</span>
          </Link>
          <nav className="links" aria-label="Start">
            <Link className="hide-sm" href="#zo-werkt-het">
              Zo werkt het
            </Link>
            <Link href="/login">Inloggen</Link>
            <Link className="btn yellow mini" href="/register">
              Account maken
            </Link>
          </nav>
        </div>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="wrap">
            <div>
              <h1>
                Weet wanneer jouw IKEA-spullen in de tweedekanshoek liggen.
                <span>En of de rit ernaartoe loont.</span>
              </h1>
              <p className="sub">
                Elk filiaal heeft zijn eigen tweedekanshoek en wat er ligt, is
                snel weer weg. Zet je lijst erin: wij zoeken alle filialen in
                Nederland, België en Duitsland af, melden het zodra het er ligt
                en rekenen uit wat de rit kost.
              </p>
              <div className="actions">
                <Link className="btn yellow lg" href="/register">
                  Gratis account maken
                </Link>
                <Link className="btn lg ghost" href="/login">
                  Inloggen
                </Link>
              </div>
              <p className="fine">
                Onofficieel project, niet gelieerd aan IKEA.
              </p>
            </div>

            <div
              className="stage"
              aria-label="Voorbeeld van een aanbieding en melding"
            >
              <span className="sample">Voorbeeld</span>
              <div className="tag">
                <span className="state">Tweedekans · goede staat</span>
                <h2>METOD</h2>
                <p className="desc">
                  Onderkast voor inbouwapparatuur, zwartgrijs, 60x60x80 cm
                </p>
                <div className="priceline">
                  <span className="eur">
                    €36<sup>00</sup>
                  </span>
                  <span className="was">nieuw €52,00</span>
                </div>
                <div className="where">
                  <span>
                    <b>Breda</b> · art. 805.916.78
                  </span>
                  <span>31% onder nieuwprijs</span>
                </div>
              </div>
              <div
                className="toast"
                role="img"
                aria-label="Melding: METOD ligt in Breda voor 36 euro"
              >
                <span className="ico-wrap">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4" />
                  </svg>
                </span>
                <span>
                  <strong>METOD ligt in Breda voor €36,00!</strong>
                  <span className="sub">
                    Tik om de aanbieding bij IKEA te openen
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="block problem">
          <div className="wrap">
            <h2 className="big">
              De tweedekanshoek is een puzzel met veel hoeken.
            </h2>
            <div className="cols">
              <p>
                Retouren, uitstalmodellen en teruggekochte meubels krijgen een
                nieuwe prijs en staan per filiaal online. Wat je zoekt ligt
                zelden in het filiaal dat je zelf als eerste checkt, en meestal
                blijft het niet lang liggen.
              </p>
              <p className="muted">
                Zelf elke dag tientallen filialen langs gaan kost meer tijd dan
                het oplevert. En dan blijft de vraag: is een rit van een uur
                voor één kast het geld waard? Hier is het antwoord op die vraag,
                met je eigen verbruik en je eigen tijd erin.
              </p>
            </div>
          </div>
        </section>

        <section className="block steps" id="zo-werkt-het">
          <div className="wrap">
            <div className="intro">
              <h2 className="big">Van lijst tot rit, in vier stappen.</h2>
              <span className="sample-note">
                Hieronder: voorbeeldgegevens, zo ziet het eruit.
              </span>
            </div>
            <ol className="sheet">
              <li>
                <div>
                  <span className="step-no" aria-hidden="true">
                    1
                  </span>
                  <h3>Zet alles op je lijst</h3>
                  <p>
                    Per ruimte een lijst: keuken, woonkamerkast, slaapkamer.
                    Plak je artikelnummers of zoek ze op. Je ziet meteen wat het
                    kost, tweedekans waar mogelijk, anders de nieuwprijs.
                  </p>
                </div>
                <div
                  className="frag"
                  role="img"
                  aria-label="Voorbeeld van een boodschappenlijst met totaal"
                >
                  <div className="row-line">
                    <span>
                      KOMPLEMENT Plank <small>4 stuks · tweedekans</small>
                    </span>
                    <strong>~€24,00</strong>
                  </div>
                  <div className="row-line">
                    <span>
                      METOD Onderkast <small>2 stuks · tweedekans</small>
                    </span>
                    <strong>~€72,00</strong>
                  </div>
                  <div className="row-line">
                    <span>
                      SEKTION Frame <small>1 stuk · nieuwprijs</small>
                    </span>
                    <strong>~€16,00</strong>
                  </div>
                  <div className="sum">
                    <span>Totaal</span>
                    <span>~€112,00</span>
                  </div>
                  <div className="saving">€81,00 onder de nieuwprijs</div>
                </div>
              </li>
              <li>
                <div>
                  <span className="step-no" aria-hidden="true">
                    2
                  </span>
                  <h3>Wij houden alle filialen bij</h3>
                  <p>
                    De aanbiedingen van alle filialen in Nederland, België en
                    Duitsland worden centraal en regelmatig ververst, met de
                    prijsgeschiedenis per artikel erbij.
                  </p>
                </div>
                <div
                  className="frag"
                  role="img"
                  aria-label="Voorbeeld van filialen met laatste ververstijd"
                >
                  <div className="dot-row">
                    <span className="dot"></span>Amsterdam
                    <span className="t">3 min geleden</span>
                  </div>
                  <div className="dot-row">
                    <span className="dot"></span>Breda
                    <span className="t">4 min geleden</span>
                  </div>
                  <div className="dot-row">
                    <span className="dot"></span>Eindhoven
                    <span className="t">4 min geleden</span>
                  </div>
                  <div className="dot-row">
                    <span className="dot"></span>Zaventem (BE)
                    <span className="t">5 min geleden</span>
                  </div>
                </div>
              </li>
              <li>
                <div>
                  <span className="step-no" aria-hidden="true">
                    3
                  </span>
                  <h3>Je krijgt een melding</h3>
                  <p>
                    Ligt iets van je lijst in een filiaal dat je volgt, dan hoor
                    je het: via ntfy, e-mail of Home Assistant. Tikken opent
                    precies die aanbieding bij IKEA.
                  </p>
                </div>
                <div
                  className="frag dark"
                  role="img"
                  aria-label="Voorbeeld van een melding"
                >
                  <div className="head-line">
                    <strong>
                      Tweedekans: KOMPLEMENT ligt in Eindhoven voor €6,00!
                    </strong>
                  </div>
                  <p className="facts-line" style={{ color: "#aebbc9" }}>
                    Plank, 50x58 cm, eikenpatroon voor €6,00 — laagste prijs tot
                    nu toe.
                  </p>
                  <div className="btns">
                    <span className="chip info">Meldingen</span>
                    <span className="chip info">Product</span>
                  </div>
                </div>
              </li>
              <li>
                <div>
                  <span className="step-no" aria-hidden="true">
                    4
                  </span>
                  <h3>Check of de rit loont</h3>
                  <p>
                    De ritje-check zet besparing tegenover brandstof en tijd,
                    ook voor een route langs meerdere filialen. Je kijkt op de
                    kaart of stuurt de route naar je telefoon.
                  </p>
                </div>
                <div
                  className="frag"
                  role="img"
                  aria-label="Voorbeeld van een rit met uitkomst"
                >
                  <div className="head-line">
                    <strong>Eindhoven via Breda</strong>
                    <span className="chip good">Rendabel</span>
                  </div>
                  <div className="big-net">+€84,34</div>
                  <p className="facts-line">
                    158,6 km · 2u 58m · brandstof €27,31 · besparing €111,65
                  </p>
                  <div className="btns">
                    <span className="btn mini">Bekijk op kaart</span>
                    <span className="btn mini">Naar mijn telefoon</span>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <h2 className="big">Wat erin zit.</h2>
            <dl className="facts">
              <div>
                <dt>Alle filialen, centraal bijgehouden</dt>
                <dd>
                  Nederland, België en Duitsland. Jij kiest welke landen je ziet
                  en welke filialen je volgt.
                </dd>
              </div>
              <div>
                <dt>Prijsgeschiedenis per artikel</dt>
                <dd>
                  Zie de laagste prijs ooit gemeten en of een aanbieding duurder
                  of goedkoper is dan eerder.
                </dd>
              </div>
              <div>
                <dt>Meerdere boodschappenlijsten</dt>
                <dd>
                  Importeer een lijst met artikelnummers, houd per stuk bij wat
                  je betaalde en zie een bon met totaal en besparing.
                </dd>
              </div>
              <div>
                <dt>Meldingen waar jij ze wilt</dt>
                <dd>
                  Push via ntfy met een eigen persoonlijk adres, e-mail of Home
                  Assistant.
                </dd>
              </div>
              <div>
                <dt>Ritje-check met route en tijd</dt>
                <dd>
                  Brandstof, rijtijd, tijd in de winkel en eventueel de waarde
                  van je tijd; een route langs meerdere filialen zonder te veel
                  stuks mee te nemen.
                </dd>
              </div>
              <div>
                <dt>Jouw gegevens zijn van jou</dt>
                <dd>
                  Lijsten, aankopen en instellingen zijn persoonlijk. Alleen de
                  aanbiedingen en prijzen zijn gedeeld.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {stats.length > 0 ? (
          <section className="block numbers" id="cijfers">
            <div className="wrap">
              <h2 className="big">Tot nu toe.</h2>
              <dl className="figures">
                {stats.map((s) => (
                  <div key={s.key}>
                    <dt>{s.label}</dt>
                    <dd>{formatStat(s)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ) : null}

        <section className="block trust">
          <div className="wrap">
            <h2 className="big">
              Onofficieel, en dat zeggen we er gewoon bij.
            </h2>
            <p style={{ marginTop: 18 }}>
              Tweedekanshoek is een onafhankelijk hulpmiddel en niet gelieerd
              aan, gesponsord door of goedgekeurd door IKEA. De aanbiedingen
              komen uit de openbare tweedekansgegevens van IKEA. Reserveren en
              kopen doe je altijd bij IKEA zelf. Bedragen met een ~ ervoor zijn
              schattingen.
            </p>
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <h2>Zet je eerste lijst erin.</h2>
            <div className="actions">
              <Link className="btn dark lg" href="/register">
                Gratis account maken
              </Link>
              <Link className="plain" href="/login">
                Ik heb al een account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="wrap">
          <span>Tweedekanshoek · onofficieel, niet gelieerd aan IKEA.</span>
          <span>
            <Link href="/login">Inloggen</Link> ·
            <Link href="/register">Account maken</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
