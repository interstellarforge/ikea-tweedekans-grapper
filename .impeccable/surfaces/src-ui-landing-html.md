---
version: 1
slug: "src-ui-landing-html"
primary_target: "src/ui/landing.html"
related_targets: []
---

# Surface brief: IKEA Tweedekans, public landing + auth + uniform app system

Scope: public landing page (`/`), login (`/login`), register (`/register`) and the shared design system for every signed-in page.
Visitor mode: landing = Persuade (understand first, then register); login/register = Operate (finish a task fast); app pages = Operate.

Audience: public (anyone may register), Dutch, phone-first. Job: understand what this is, trust it (unofficial, honest numbers), create an account.
Proof available: real features and real mechanics only; no customer counts, reviews or press. Demonstration fragments are synthetic and labelled "Voorbeeld".
Constraints: all existing functions and Dutch terms stay; no marketing fluff; usable one-handed; no emoji or glyph icons; no native popups; light and dark.

## Direction contract

THESIS: A shop-floor companion in IKEA's own visual language (blue, yellow, price-tag numerals, assembly-sheet logic) that proves its mechanism with real UI fragments instead of claims; it refuses the SaaS landing template (centred headline, three icon cards, logo wall).
OWN-WORLD: IKEA blue #0058A3 and yellow #FFDB00 on a cool off-white (dark mode: ink-blue), Noto Sans (IKEA's own face) self-hosted, large price numerals with raised cents like a price tag, article numbers as 000.000.00, flat 1px rules, small radii, shadows only with real offset and blur, SVG icons in one 1.75px stroke.
STORY: The visitor understands in one screen that second-chance stock is scattered and quickly gone, sees the loop (lijst, melding, ritje-check, kaart) demonstrated with real components, trusts the honest unofficial note, and registers.
FIRST VIEWPORT: Blue field owning the hero: left a two-line statement of the outcome, one plain sentence of how, yellow primary "Gratis account maken" plus quiet "Inloggen"; right a price-tag object (METOD-type offer with raised-cents price, store and condition) with a notification fragment overlapping its corner, labelled Voorbeeld; the unofficial note sits under the actions.
FORM: Persuade landing with an assembly-sheet "Zo werkt het" sequence of four live UI fragments (receipt list, notification, trip result, map actions), a ruled facts list instead of cards, and a yellow closing band; seed: user-pinned direction (close to IKEA), no roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
