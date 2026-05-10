# Contributing to uffda-ag/sandbox

Three lanes, one schema, one API. Pick a lane, write a `tile.json`, open a PR.

---

## Lane 1 — Iframe widget tile (the primary lane)

For self-contained mini-apps: games, calculators, explorers. Your HTML, your CSS, your dependencies. Renders inside an iframe on [/sandbox](https://uffda.ag/sandbox) wrapped in UFFDA's tile chrome.

### Steps

1. Fork this repo.
2. Add a folder under `tiles/iframe/<your-slug>/`. The slug is lowercase, kebab-case, unique.
3. Inside that folder, add:
   - `tile.json` — metadata (schema below).
   - `index.html` — entry file. May reference local assets in the same folder.
   - Any assets (CSS, JS, images) the tile needs. Keep the folder self-contained — no relative imports outside it.
4. Open a PR to `main`. Title: `Add iframe tile: <name>`.

### Constraints

- Tile loads in an iframe with `sandbox="allow-scripts allow-popups"`. No top-level navigation, no localStorage / cookies. Use `postMessage` to talk to the parent.
- Keep the folder under **2 MB**. Larger payloads need a discussion in advance.
- No third-party trackers, analytics scripts, or ad tags. UFFDA is ad-free; tiles inherit that.
- Declare your license in `tile.json`. We don't merge tiles without a declared license.

### Example: Guess the Crop

The seed iframe tile (see `tiles/iframe/guess-the-crop/`) is the canonical example. Read it to see the wrapper contract in practice.

---

## Lane 2 — Native React widget tile

For tools that need direct access to UFFDA's state — a calculator that reads the selected field's SSURGO data, a viewer that responds to AOI changes, etc. Ships as a React component bundled into the main app.

### Steps

1. Fork this repo.
2. Add a folder under `tiles/react/<your-slug>/`.
3. Inside that folder:
   - `tile.json` — metadata (schema below).
   - `Tile.tsx` — default export, no required props. TypeScript only.
   - Any additional `.ts` / `.tsx` files the tile needs.
4. Open a PR to `main`. Title: `Add react tile: <name>`.

### Constraints

- Higher trust bar than iframe — your code runs in the main app context. Reviewers will read the diff line-by-line.
- No new runtime dependencies without discussion. The main app ships React 18 + Next.js 14 + MapLibre + Tailwind already.
- Use the `window.uffda` API for state. Don't reach into UFFDA's internal stores directly.
- Default export, no required props, must be a pure functional component or use only React hooks.

---

## Lane 3 — Link card tile

For things hosted elsewhere — Observable notebooks, blog posts, third-party tools we want to surface in the gallery. Renders as a card on /sandbox that links out.

### Steps

1. Fork this repo.
2. Add a folder under `tiles/link/<your-slug>/`. (Folder, not file — even though it's just one manifest, keeping the structure consistent.)
3. Add `tile.json` with the external URL.
4. Open a PR to `main`. Title: `Add link tile: <name>`.

### Constraints

- The destination URL needs to be stable and ad-free. We won't link to paywalled content unless there's a clear public-good case.
- Add a screenshot in the same folder if the link doesn't render well as a card preview — name it `preview.png`, max 800×600, under 200 KB.

---

## The `tile.json` schema

Every tile validates against [`tile.schema.json`](./tile.schema.json) at the repo root. The fields:

```json
{
  "name": "Guess the Crop",
  "slug": "guess-the-crop",
  "type": "iframe",
  "status": "live",
  "tagline": "Can you tell corn from soy from a satellite chip?",
  "description": "30-second game. We show you a Sentinel-2 image of a field. You guess the crop. Built on USDA CDL ground truth.",
  "icon": "play",
  "tags": ["game", "cdl", "sentinel-2", "crop-id"],
  "author": {
    "name": "Jane Smith",
    "github": "janesmith",
    "site": "https://janesmith.dev"
  },
  "license": "MIT",
  "featured": false,
  "createdAt": "2026-05-09",
  "entry": "index.html"
}
```

Field notes:

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Human-readable, title-case. Shows on the tile card and detail page. |
| `slug` | yes | Lowercase, kebab-case. Must match the folder name. URL becomes `/sandbox/<slug>`. |
| `type` | yes | One of `iframe`, `react`, `link`. |
| `status` | yes | `coming-soon`, `in-dev`, `live`. Affects badge in the gallery. |
| `tagline` | yes | One sentence, under 80 chars. Shows on the card. |
| `description` | yes | One paragraph. Shows on the detail page. |
| `icon` | yes | One of `play` (games), `globe` (layers/maps), `doc` (explainers/articles), `build-it` (claim-this calls for contributors). Drives the tile's icon. |
| `tags` | yes | Array, 1–6 strings, lowercase kebab-case. Used for filtering. |
| `author` | yes | At minimum `name` and one of `github` / `site`. |
| `license` | yes | SPDX identifier (e.g., `MIT`, `Apache-2.0`, `CC-BY-4.0`, `CC0-1.0`). |
| `featured` | no | Boolean, defaults `false`. Set by UFFDA maintainers, not contributors. |
| `createdAt` | yes | ISO date `YYYY-MM-DD`. |
| `entry` | required for iframe/react | File name relative to the tile folder. Defaults: `index.html` for iframe, `Tile.tsx` for react. |
| `url` | required for link | External URL. |

---

## The `window.uffda` API

Tiles can read UFFDA's state through a small, stable API. Read-only. Never writes.

### Iframe tiles (via `postMessage`)

```js
// In your tile:
window.parent.postMessage({ type: 'uffda:request', request: 'state' }, '*');

window.addEventListener('message', (e) => {
  if (e.data?.type === 'uffda:state') {
    const { aoi, selectedField, layers } = e.data.payload;
    // aoi: { bbox: [w, s, e, n], center: [lng, lat], zoom: number } | null
    // selectedField: { id, source, properties } | null
    // layers: array of { id, name, license, status } for each layer currently in scope
  }
});

// Subscribe to changes:
window.parent.postMessage({ type: 'uffda:subscribe' }, '*');
// You'll get 'uffda:state' messages on every relevant change. Unsubscribe with { type: 'uffda:unsubscribe' }.
```

### React tiles

```tsx
import { useUffda } from '@/uffda';

export default function Tile() {
  const { aoi, selectedField, layers } = useUffda();
  // Same shape as iframe payload above. Re-renders on change.
  return <div>{selectedField?.id ?? 'No field selected'}</div>;
}
```

### What the API does NOT provide

- Network access to other UFFDA APIs. Tiles that want field-history, NDVI, SSURGO, etc. should hit the public USDA / NASA / Microsoft / ESA endpoints directly. We don't proxy.
- Write access. Tiles can't change UFFDA's state. If you need persistence, use `postMessage` to surface user intent and let UFFDA decide.
- Authentication state. Pioneer-gated tiles run inside /sandbox, which is itself Pioneer-gated; tiles assume an authenticated user.

The full API contract is versioned and documented at [uffda.ag/sandbox/api](https://uffda.ag/sandbox/api) (live as of Sprint 16). Breaking changes go through a deprecation window — same as the main app's other interfaces.

---

## Review process

Maintainers (currently [@nrreinke](https://github.com/nrreinke) and the UFFDA core team) review PRs against:

- **Schema validity** — does `tile.json` pass `tile.schema.json`?
- **Content fit** — is this on-mission for UFFDA? (Open ag data, plain-English access, alliance ethos.)
- **License clarity** — declared SPDX, no ambiguity, compatible with the repo's MIT wrapper.
- **Quality bar** — works, doesn't embarrass us, has a point of view.

If something needs work, we'll comment and you'll iterate. We try to merge or land a clear "not this time, here's why" within a week.

---

## Code of conduct

Be kind. Be honest. Be useful. Disagreement is fine; bad faith isn't. We'll remove what doesn't fit. Report issues to hello@uffda.ag.

— UFFDA core
