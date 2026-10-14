# ikea-tweedekans-grapper

LAN webpage + service: follow IKEA Tweedekanshoek offers in chosen stores, search them, see what's new.

- Data: IKEA's public as-is API (`web-api.ikea.com/circular/circular-asis`), polled for all stores of the enabled countries (NL on by default; BE and DE optional in `/settings`).
- Stack: Node >=22.18 (native TS + `node:sqlite`), no runtime deps. DB: `data/tweedekans.db`.

## Run

    pnpm install
    pnpm start        # http://<host>:8080

Env: `PORT` (8080), `HOST` (0.0.0.0), `DB_PATH`, `POLL_INTERVAL_MIN` (15), `IKEA_COUNTRY`/`IKEA_LANGUAGE` (nl), `IKEA_CLIENT_ID`, `AUTH_USERNAME` (admin), **`AUTH_PASSWORD` (verplicht, min. 8 tekens; `AUTH_DISABLED=true` zet login uit)**, `NTFY_URL` (optional push, e.g. `https://ntfy.sh/<topic>`). E-mail (SMTP) en ntfy stel je in op `/settings`; het SMTP-wachtwoord wordt met AES-256-GCM versleuteld opgeslagen; de sleutel staat in `data/secret.key` (0600) of in `SECRET_KEY` (64 hex-tekens).

## Linux service (systemd)

    sudo ./deploy/install.sh

Eén commando: kopieert de app naar `/opt/ikea-tweedekans-grapper`, installeert de dependency, maakt gebruiker `ikea`,
`/etc/ikea-tweedekans.env` (met gegenereerd wachtwoord en sleutel), de systemd-unit, en start de service.
Opnieuw uitvoeren = updaten (config en data blijven). Verwijderen: `sudo ./deploy/install.sh --uninstall`.
Is Node.js ontbrekend of te oud (< 22.18), dan installeert het script zelf Node.js 24 (checksum-geverifieerd) in `/opt/ikea-tweedekans-node`, zonder de systeem-Node aan te passen (nodig: curl, tar, xz). Logs: `journalctl -u ikea-tweedekans -f`.

## Pages

`/product/:articleNumber` (productdetail: alle tweedekansaanbiedingen + prijsgeschiedenis), `/watchlist` (watchlist + meldingen), `/catalog` (zoeken in IKEA-assortiment), `/tweedekans` (zoeken in alle tweedekansaanbiedingen), `/watchlist` (tabs: watchlist + meerdere boodschappenlijsten met importeren, bon en aankopen per stuk), `/profile` (wachtwoord wijzigen), `/trips` (ritje-check per filiaal + slimste route langs meerdere filialen), `/alerts` (meldingshistorie), `/settings` (tabs: filialen, ritje-check, meldingen [Home Assistant, ntfy, e-mail], ophalen & status; gevolgde filialen, interval, ntfy, status).

Alle filialen worden periodiek opgehaald; per aanbieding worden artikelnummer en prijs bewaard (`price_history`) voor prijsvergelijking.
Gevolgde filialen bepalen alleen waarvoor meldingen komen.

## API

`GET /api/stores`, `PUT /api/stores/:id/followed`, `GET|PUT /api/settings`, `GET /api/status`, `POST /api/sync`,
`GET /api/catalog?q=`, `GET|PUT /api/watchlist`, `DELETE /api/watchlist/:articleNumber`,
`GET /api/trips`, `PUT /api/watchlist/:articleNumber/quantity`, `GET /api/alerts`, `POST /api/alerts/seen`, `GET /api/offers?q=&store=&followed=&newHours=&sort=&limit=&offset=`

## ntfy (push) op jupiter

`deploy/ntfy/docker-compose.yml` draait een eigen ntfy-server (standaard host-poort 8097, via `NTFY_PORT`).

    cd deploy/ntfy
    cp .env.example .env   # NTFY_BASE_URL = publieke URL via Nginx Proxy Manager
    docker compose up -d

Nginx Proxy Manager: Proxy Host met scheme `http`, forward host = jupiter, forward port = `NTFY_PORT`,
**Websockets Support aan** (nodig voor live meldingen), SSL naar keuze.
Zet daarna in `/settings` van de app de ntfy-URL op `<NTFY_BASE_URL>/tweedekans` en abonneer de ntfy-app op topic `tweedekans`.

## App in Docker

    cp .env.example .env     # APP_PORT (standaard 8090), POLL_INTERVAL_MIN, optioneel SECRET_KEY
    docker compose up -d --build

Data (SQLite + `secret.key`) staat in het volume `tweedekans-data` (`/data`). UI: `http://<host>:<APP_PORT>/`.
Draait ntfy op dezelfde host, gebruik dan als ntfy-URL `http://<host>:<NTFY_PORT>/tweedekans`
(vanuit de container is `localhost` niet de host).

## Beveiliging

- Alle pagina's en API's vereisen login (sessiecookie: HttpOnly, SameSite=Lax, 30 dagen, `Secure` achter HTTPS-proxy).
- Max. 5 foute pogingen per IP per 15 min. `/healthz` is publiek.
- Zet de app achter HTTPS (Nginx Proxy Manager) en bij voorkeur een Access List/IP-beperking in NPM als extra laag.
