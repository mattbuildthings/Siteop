# Site Ops Design System

Site Ops is construction site management software. The core workflow: crews and site managers capture **photo and audio notes** in the field (progress, hazards, defects), tag them to a location/site, and sync them for the office to review. No codebase or Figma file was provided — this system was built from a brief description plus one AI-generated mood image (`uploads/df783b11eedb6ac6664c292d9644a386.jpg`, used only for color/vibe direction, not as a literal UI source).

Products: a responsive web app (office/dashboard use), a mobile app (field capture), and a marketing site.

## Content fundamentals
- **Tone**: direct, plain, operational. Short sentences, imperative verbs ("Attach photo", "Log note", "Start walk"). No fluff, no exclamation points.
- **Voice**: second person for instructions ("You have 3 notes pending sync"), third person/passive for logs ("Logged 08:42 AM by J. Alvarez").
- **Casing**: sentence case for body copy and buttons; UPPERCASE with wide letter-spacing for eyebrow labels, status tags, and section markers (a "site tag" motif — `SITE 04 — EAST WING`).
- **Numbers & data**: timestamps, coordinates, and IDs are set in monospace and treated as first-class content, not decoration.
- **Emoji**: not used. This is a professional field tool.
- **Vibe**: rugged, trustworthy, unfussy — closer to industrial signage and safety equipment than consumer software.

## Visual foundations
- **Color**: Deep Teal (`--color-primary`) as the dominant surface/action color; Signal Orange (`--color-accent`) reserved for the single primary CTA per screen, alerts, and focus rings. Warm gray neutrals (not cool/blue-gray) for backgrounds and text.
- **Type**: Big Shoulders (condensed, uppercase) for headers and section labels — reads like stenciled site signage. Public Sans for all UI/body text. Space Mono for timestamps, IDs, and coordinates.
- **Spacing**: 4px base scale (4/8/12/16/24/32/48/64/96).
- **Backgrounds**: flat color, no gradients, no textures/patterns. Photos (from note capture) are the only imagery — real photos, not illustration.
- **Shadows/elevation**: mostly flat. Borders (2px, warm gray) do the work of separating surfaces; shadow is a light `sm` touch on cards and a heavier `lg` only on modals/toasts that float above content.
- **Corner radii**: modest — 4px small controls, 8px inputs/buttons, 12px cards. Never fully rounded except pills (badges, switches).
- **Animation**: minimal. 120–200ms ease transitions on hover/press only — no bouncing, no entrance choreography. This is a utility tool used outdoors, often one-handed.
- **Hover/press states**: hover darkens primary/accent buttons one step; press has no additional shrink/scale, just the darker color held.
- **Transparency/blur**: none, except a 50% black scrim behind modals.
- **Imagery color vibe**: real jobsite photography — natural light, no filters, no forced warmth/coolness.

## Iconography
No in-house icon set was supplied. **Lucide** (CDN, outline style, 1.5px stroke) is used as the substitute icon system — closest match to the flat, functional aesthetic. See `guidelines/iconography.card.html`. Construction-specific glyphs (camera, mic, map-pin, hard-hat, clipboard) come from the same set.

## No logo
No logo file was supplied. The brand renders as a wordmark: "Site" in white, "Ops" in Signal Orange, set in Big Shoulders. See `guidelines/brand-mark.card.html`.

## Intentional additions
- **NoteCard** (`components/notes/`) — not defined by any source, but the photo/audio field note is the product's core object, so it's included as a first-class primitive.

## Index
- `styles.css` — root stylesheet (imports everything in `tokens/`)
- `tokens/` — colors, typography, spacing, effects (radius/shadow/motion), fonts
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand)
- `components/`
  - `core/` — Button, Badge, Card
  - `forms/` — Input, Select, Checkbox, Radio, Switch
  - `feedback/` — Toast, Tooltip
  - `navigation/` — Tabs
  - `overlay/` — Dialog
  - `notes/` — NoteCard
- `ui_kits/`
  - `web-app/` — office dashboard (site list, site detail, note review)
  - `mobile/` — field capture flow (note feed, capture, note detail)
  - `marketing/` — landing page
- `assets/` — (empty — no logo/imagery supplied; see "No logo" above)
- `SKILL.md` — portable skill definition for use outside this environment
