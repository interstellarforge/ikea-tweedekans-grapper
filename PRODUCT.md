# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: plain HTML/CSS/vanilla JS pages in `src/ui`, served by a dependency-free Node server (`src/server.ts`). No framework or build step; keep it that way unless the user decides otherwise.

## Users

People in the Netherlands (and nearby Belgium/Germany) who furnish a home with IKEA products and want them cheaper: they browse IKEA's "Tweedekanshoek" (second-chance corner: returns, ex-display, buy-backs) per store, or plan a whole project (kitchen, wardrobe, bedroom) and want to know when and where the pieces they need appear second-hand. Open to the public: strangers can register themselves. Dutch-language UI. Used on desktop and, often, on the phone while in the car or in the store.

## Product Purpose

IKEA only shows second-chance stock per store, scattered, and it sells out quickly. The app fetches the second-chance offers of all stores centrally, lets each user keep a watchlist and shopping lists (with quantities, prices paid and a receipt-like total), notifies them when a wanted product appears in a store they follow, and calculates whether a trip is worth it (fuel, time, optionally a multi-store route) including a map link to send to the phone. Success: the user buys the products they need second-hand, at a lower price, with fewer wasted trips.

## Positioning

An independent companion for IKEA's second-chance stock: it does not just list offers, it turns "what do I need" plus "where is it available and at what price" into a concrete, profitable shopping trip (shopping list → watchlist → alert → trip check → route on the map). It is unofficial and not affiliated with IKEA.

## Operating Context

- Offers come from IKEA's public as-is API and are refreshed every ~15 minutes for all stores of NL, BE and DE; prices and price history are tracked per article.
- Accounts: email + password, per-user data (watchlist, lists, purchases, alerts, followed stores, settings). Admin manages users, notification types (ntfy, e-mail, Home Assistant) and fetching.
- Notifications: personal ntfy topic, e-mail via the admin's SMTP, or Home Assistant. Tapping a notification opens the exact offer at IKEA.
- Self-hosted (Docker or systemd) behind a reverse proxy.

## Capabilities and Constraints

- Pages: landing (to be built), login/register, lijsten (watchlist + multiple shopping lists), zoeken in producten, zoeken in tweedekanshoek, product detail with price history, ritje-check (single store, multi-store route, time and money, map), meldingen, instellingen, profiel, beheer.
- Terminology (keep): tweedekanshoek, watchlist, boodschappenlijst, ritje-check, gevolgd filiaal, melding.
- Money is always shown in euros; estimated amounts are prefixed with "~".
- No native popups; custom modals only. Mobile-friendly is required.
- Visual style, landing concept and copy are undecided and are owned by the design work, not this file.

## Brand Commitments

Name stays "IKEA Tweedekans" (confirmed by the user), always with a clear note that the app is unofficial and not affiliated with IKEA. No claims of partnership or official data.

## Evidence on Hand

Real, live functionality and data; no testimonials, customer counts, press or benchmarks exist and none may be invented. Landing copy may describe real features and real mechanics only (e.g. "alle filialen in NL, BE en DE", "elke ~15 minuten ververst"); real numbers of stores/offers can be read from the app, not asserted.

## Product Principles

1. Decide, don't just display: every screen should help answer "moet ik nu gaan, en waarheen?".
2. Honest numbers: estimates are marked as estimates, savings are computed against real new prices, and time is priced only when the user says so.
3. Personal and private: each user's lists, purchases and settings are theirs alone; shared data is only the offers.
4. Phone-first in the moment: the trip and the receipt must be usable one-handed in a car park or a store.

## Accessibility & Inclusion

Dutch language; legible on phones in daylight; keyboard-operable controls, sufficient contrast in light and dark, and never colour as the only signal (savings/overpay carry text as well).
