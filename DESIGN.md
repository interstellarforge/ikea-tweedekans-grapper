---
name: IKEA Tweedekans
description: Unofficial shop-floor companion for IKEA second-chance stock, in IKEA's blue, yellow and price-tag numerals.
colors:
  blue: "#0058a3"
  blue-strong: "#003e75"
  blue-soft: "#e3effa"
  yellow: "#ffdb00"
  yellow-strong: "#f2c800"
  bg: "#f3f5f8"
  surface: "#ffffff"
  surface-2: "#eef1f5"
  fg: "#111a24"
  muted: "#566170"
  line: "#d9dfe7"
  line-strong: "#bcc5d1"
  link: "#004f93"
  good: "#17703f"
  good-bg: "#dcf3e5"
  bad: "#b3261e"
  bad-bg: "#fde6e3"
  warn: "#8f4a00"
  warn-bg: "#ffecc9"
  info: "#004f93"
  info-bg: "#dfeefb"
  neutral-bg: "#e8ecf1"
  dark-bg: "#0d1218"
  dark-surface: "#151c24"
  dark-surface-2: "#1b242e"
  dark-fg: "#e9eef4"
  dark-brand: "#0a4f90"
typography:
  h1:
    fontFamily: "Noto Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h2:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h3:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  price:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    letterSpacing: "-0.01em"
  landing-display:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "clamp(34px, 6vw, 60px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  price-tag-numeral:
    fontFamily: "Noto Sans, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.blue-strong}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-yellow:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-yellow-hover:
    backgroundColor: "{colors.yellow-strong}"
  button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: "36px"
  button-mini:
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "42px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px"
  chip:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  chip-new:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.fg}"
  count-badge:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
  shell-header:
    backgroundColor: "{colors.blue}"
    textColor: "#ffffff"
    height: "60px"
  tab-active:
    textColor: "{colors.fg}"
  pill-active:
    backgroundColor: "{colors.blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
---

# Design System: IKEA Tweedekans

## Overview

**Creative North Star: "The Shop-Floor Companion"**

The app speaks IKEA's own visual language: a blue field, a yellow action, price-tag numerals and assembly-sheet logic. It is a tool used one-handed in a car park or a store, so it is dense, flat and legible rather than decorative. Everything that is not a number or an action recedes into cool off-white (dark mode: ink-blue).

Depth comes from 1px rules and tonal surfaces; shadows are soft, real-offset and used sparingly. Radii are small (8px controls, 14px containers). One icon stroke (1.75px) and one typeface (Noto Sans, self-hosted) carry the whole system. The landing rejects the SaaS template (centred headline, three icon cards, logo wall) and proves its mechanism with real UI fragments labelled "Voorbeeld".

**Key Characteristics:**
- Blue owns identity (header, hero, aside, primary buttons); yellow owns the single action and the focus ring.
- Prices are the loudest type: heavy numerals, tabular figures, raised cents on the landing tag.
- Flat 1px rules (`line`, `line-strong`) separate content; 2px ink rules mark assembly-sheet steps and totals.
- Light and dark both first-class via `prefers-color-scheme`.
- Status always carries text, never colour alone.

## Colors

IKEA blue and yellow over a cool, slightly blue-grey neutral ramp; semantic status colours are muted and paired with tinted backgrounds.

### Primary
- **IKEA Blue** (`blue`): header, hero field, auth aside, primary buttons, active pill, active tab underline, checkbox accent.
- **Deep Blue** (`blue-strong`): primary hover, small text on blue-tinted callouts.
- **Link Blue** (`link`): links and secondary button text; darker than brand for contrast on white.
- **Soft Blue** (`blue-soft`): tinted blue surfaces.

### Secondary
- **IKEA Yellow** (`yellow`): the one action button, focus ring, count badges, "new" chip, active-nav underline, selection highlight, icon strokes on blue.
- **Pressed Yellow** (`yellow-strong`): yellow button hover.

### Neutral
- **Mist** (`bg`): page background. **White** (`surface`): cards, panels, inputs. **Fog** (`surface-2`): readonly fields, group heads, steps band.
- **Ink** (`fg`): text, and the text colour on yellow. **Slate** (`muted`): secondary text, labels.
- **Rule** (`line`) and **Strong Rule** (`line-strong`): hairlines, input borders.
- Status: `good`, `bad`, `warn`, `info` each with a `-bg` tint; `neutral-bg` for default chips and hover.
- Dark mode remaps neutrals (`dark-*`) and lightens status/link text; brand becomes `dark-brand`.

### Named Rules
**The One Action Rule.** Yellow marks the single most important action or signal on a surface; blue is identity and default buttons.
**The Text-On-Yellow Rule.** Text on yellow is always `fg` ink, never white.
**The Status Pair Rule.** Status colour text sits on its `-bg` tint and is accompanied by words or an icon.

## Typography

**Font:** Noto Sans, self-hosted variable woff2 (weights 100-900, latin subset) with system-ui fallbacks. Monospace only for inline `code`.

**Character:** One family, contrast made by weight (400 body, 500-600 UI, 700 headings, 800 numerals and display) rather than by second face.

### Hierarchy
- **Display** (800, clamp(34px, 6vw, 60px), 1.04, -0.025em): landing hero only; second line in yellow.
- **Price-tag numeral** (800, 56px, 1, -0.04em, raised cents at 24px): the landing tag object.
- **H1** (800, 28px; 23px under 720px, 1.2): page titles.
- **H2** (700, 18px, 1.2): panels, dialogs.
- **H3** (700, 15px): card titles, group heads.
- **Body** (400, 15px, 1.5): default; lead text capped at 70ch.
- **Label** (600, 14px, 1.2): buttons; pills 500.
- **Caption** (400-500, 12-13px, muted): hints, meta, chips (700 at 12px).
- **Price** (800, 20px; net result 19px): any money figure.

### Named Rules
**The Tabular Rule.** Prices, quantities, durations and table cells use tabular numerals.
**The Weight-Not-Face Rule.** Hierarchy comes from weight and size inside Noto Sans; no second display face.

## Layout

Content sits in a 1200px centred column (landing 1140px) with 16px side padding (14px on phones), 24px top and 56px bottom. Spacing rhythm is 6, 8, 10, 12, 14, 18, 24px. Card grids are `auto-fill` with 220px minimum (150px on phones), 14px gap. Forms use a label/control grid (230px or 150px label column) that collapses to one column at 720px. The single mobile breakpoint is 720px; auth splits into aside plus form at 900px; landing sections switch at 900px and 560px. Under 720px the header nav collapses behind a burger, controls reach 40px minimum height, and toolbars stack full-width. Tables scroll horizontally inside a wrapper.

## Elevation & Depth

Hybrid, mostly flat: tonal surfaces plus 1px rules carry structure; shadows mark things that float or are interactive.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgba(17,26,36,.08), 0 2px 8px rgba(17,26,36,.06)`): cards, landing fragments.
- **Float** (`0 4px 12px rgba(17,26,36,.12), 0 16px 40px rgba(17,26,36,.14)`): menus, dialogs, card hover.
- **Hero objects** (`0 2px 4px rgba(0,0,0,.18), 0 22px 44px rgba(0,0,0,.3)`): the landing price tag and notification only, slightly rotated (-1.6deg and 0.8deg).

### Named Rules
**The Real Offset Rule.** Shadows have blur and a real offset and soften; no hard zero-blur offsets.

## Shapes

Small, confident radii: 4px for focus ring and code, 8px for buttons, inputs, menu items; 14px for cards, panels, dialogs, menus; full pill for chips, counts, mini buttons, state labels and filter pills; circle for avatar and step numbers. Borders are 1px; the active nav item uses an inset 3px yellow bottom edge (4px left on mobile). Icons are 24px-viewBox line SVGs, stroke 1.75px (2px in chips and auth list), round caps and joins, drawn at 16-20px, from one inline set in `app.js`.

## Components

### Buttons
- **Primary:** blue fill, white 600 14px text, 8px radius, 10px 16px padding; hover to Deep Blue; active nudges down 1px; disabled 50% opacity.
- **Secondary (`a.btn`, `.secondary`):** transparent, link-blue text, strong-rule border, neutral hover.
- **Yellow:** yellow fill with ink text for the one action; hover Pressed Yellow.
- **Danger:** bad-red fill, white text. **Icon:** 36px square, muted, becomes tinted on hover (danger) or `on` (info).
- **Mini:** pill, 13px. **Large:** 16px, 14px 22px, 10px radius.
- **Focus (all):** 3px yellow outline, 2px offset.

### Inputs / Fields
- 42px min height, white, 1px strong-rule border, 8px radius; placeholder muted. Focus: brand border plus 3px translucent yellow outline. Readonly uses Fog. Money inputs carry an inline euro prefix, right-aligned figures.
- Auth inputs are 46px, submit 48px full width.

### Cards / Panels
- 14px radius, white, 1px rule. Product card: square contained image on white with bottom rule, body 12px 14px, Rest shadow, Float on hover.

### Chips, State, Count
- Pill chips 12px/700 in neutral, good, bad, warn, info (tinted) or yellow "new". State labels are the same pill on `neutral-bg`, good when on. Count badge: yellow pill, ink text.

### Navigation
- Blue sticky header, 60px, brand mark plus wordmark, links white 500 at 88% opacity; active gets 18% white fill, 700, yellow underline. Avatar circle (40px, 2px translucent white border) opens a 14px-radius menu with 18px line icons. In-page tabs: muted text, 3px bottom border, active brand underline. Filter pills: active fills blue.

### Dialogs
- Native `dialog.modal`, 560px max, head/body/foot separated by 1px rules, 60% dark backdrop, Float shadow. No native alerts.

### Price Tag (signature)
- White card with a yellow left strip and blue punched dot, large price numerals with raised cents, struck "was" price, store and condition row, overlapping dark notification toast, "Voorbeeld" label. Landing only.

### Assembly Sheet (signature)
- "Zo werkt het": numbered steps (46px blue circle) between 2px ink rules, each paired with a real UI fragment; receipt totals use a 2px ink rule above.

## Do's and Don'ts

### Do:
- **Do** use `var(--*)` tokens; the dark theme works only through them.
- **Do** reserve yellow for the one action, focus and small signals; put ink text on it.
- **Do** show money in euros with tabular numerals, prefix estimates with "~".
- **Do** use the shared inline SVG icon set at stroke 1.75px for every icon.
- **Do** use custom `dialog.modal` instead of native popups.
- **Do** label demonstration fragments "Voorbeeld" and keep the unofficial, not-affiliated-with-IKEA note near actions.

### Don't:
- **Don't** use emoji or glyph characters as icons.
- **Don't** use a second typeface or system display face for headings.
- **Don't** signal status by colour alone.
- **Don't** add gradient fills, glassmorphism or hard offset shadows.
- **Don't** build the landing from centred hero, three icon cards and a logo wall.
- **Don't** claim partnership, testimonials, counts or press that do not exist.
