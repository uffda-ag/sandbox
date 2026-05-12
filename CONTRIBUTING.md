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
- Declare your license in `tile.json` (SPDX identifier). Approved iframe licenses: **MIT, Apache-2.0, BSD-3-Clause, CC-BY-4.0, CC-BY-SA-4.0, CC0-1.0, NOASSERTION**. AGPL/GPL not accepted on iframe tiles — copyleft-on-distribution doesn't compose cleanly with how UFFDA loads tiles. Tiles without a declared license won't merge. **NOASSERTION** is the SPDX value meaning "license uncertain" — fine for older code, Stack-Overflow-derived utilities, or anything where the lineage is genuinely unclear. Pair it with a `licenseNote` (best-effort note up to 280 chars) so users know what you do remember. Iframe tiles with NOASSERTION render with a "?" badge in the wrapper; users see the uncertainty up front.

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
- Declare your license in `tile.json` (SPDX identifier). Approved native-React-tile licenses: **MIT, Apache-2.0, BSD-3-Clause**. **No copyleft** — copyleft tiles would bundle into UFFDA's main app and infect its Apache 2.0 license; this is the same rule every modern OSS app applies. **No NOASSERTION on native-React tiles either** — bundled-into-the-app means uncertain provenance is a real legal hazard, so the bar here is higher. Use the iframe lane if you have an uncertain-pedigree tile you still want to ship.
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
- Declare a license for the linked content's reuse terms in `tile.json` — SPDX identifier or `NOASSERTION` if you don't know. Link tiles with NOASSERTION render with a "?" badge, same as iframe tiles. The license refers to the destination content, not the link tile itself.
- Add a screenshot in the same folder if the link doesn't render well as a card preview — name it `preview.png`, max 800×600, under 200 KB.
- **Not for promotional links.** Commercial / revenue-driving / self-promo destinations belong in Commons as a conversation thread, not on the Sandbox tile shelf. See "Tiles vs. Commons threads" below.

---

## Tiles vs. Commons threads — what goes where

UFFDA's Sandbox is **curated**. Commons is **open conversation**. Both are part of UFFDA; they're different surfaces with different purposes. Some submissions fit one surface better than the other.

### Submit as a tile here if it's:

- **Open-licensed** (one of the approved SPDX identifiers per lane, or `NOASSERTION` with a `licenseNote` for iframe + link tiles)
- **Built for UFFDA users** — a tool, a game, a layer, an explainer, an experiment
- **A standalone artifact** someone can interact with
- **On-mission** — open ag data, plain-English access, alliance ethos

### Take it to Commons instead if it's:

- **Commercial or revenue-driving** — your hosted service, your paid tool, your consultancy
- **Promotional / ad-style** — "check out my company's product"
- **A "thing I found"** share without the contributor having built it
- **Closed-source** where the user can't see what they're using
- **Conversational by nature** — "we should consider X" / "here's what I'm thinking about" / "anyone tried Y?"

### The heuristic, plain

Tiles are **things UFFDA users do**. Commons is **things UFFDA users talk about**. There's real overlap; this is judgment, not a strict rule.

**When in doubt:** start in Commons. Lower friction, larger audience, conversation is the right primary mode for most things. If a thread shows actual use — multiple Pioneers want to use the thing, the maker is willing to license it on UFFDA-compatible terms — graduate it to a tile later.

### When we decline a tile and route to Commons

Maintainers will say so clearly and link the contributor to a pre-filled Commons composer:

> *"This is a great Commons share rather than a Sandbox tile — promotional / commercial / closed-source content fits better as a conversation. [Post it as an Offering in Commons →](https://uffda.ag/commons/post?type=offering)"*

No bad feelings; same project, different surface.

### Edge cases will exist

Open-licensed tool whose maker also charges for hosted support. A free product that links to a paid tier. A tutorial that's CC-BY-licensed but lives on someone's marketing-flavored blog. Maintainers make a judgment call, write one paragraph in the PR explaining the call, move on. The goal is freedom-to-share with the lightest workable curation — not perfect rule-coverage. Transparency and freedom-to-operate rank higher than buttoned-up rule structures.

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
| `license` | yes | SPDX identifier (e.g., `MIT`, `Apache-2.0`, `CC-BY-4.0`, `CC0-1.0`), or `NOASSERTION` for uncertain-lineage tiles (iframe + link only — not native React). See the lane sections above. |
| `licenseNote` | no | Free-text best-effort note about the license, max 280 chars. Encouraged when `license` is `NOASSERTION` so users see what you do remember. Renders next to the license badge in the wrapper. |
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

## Contributor sign-off — Developer Certificate of Origin (DCO)

UFFDA uses the **Developer Certificate of Origin** instead of a Contributor License Agreement. The DCO is the same standard used by Linux, Docker, Kubernetes, and GitLab — it's lightweight, doesn't require any forms or external accounts, and works for both individual and corporate contributors.

What you're agreeing to (the [DCO 1.1 text](https://developercertificate.org/) in plain English):

- The contribution is your own work, OR
- The contribution is based on work covered by an open-source license you have the right to submit it under, OR
- The contribution was provided to you by someone who certified the above, and you're forwarding it unchanged.
- You understand the contribution is public, your sign-off is part of the public record, and the project may redistribute it under the project's license forever.

**How to sign off:** add `-s` to your commit command. That's it.

```bash
git commit -s -m "Add iframe tile: my-cool-game"
```

Git will append a line to your commit message that reads:

```
Signed-off-by: Your Name <your-email@example.com>
```

That signature *is* the DCO certification — the same way it works for the Linux kernel. CI checks that every commit in a PR has it. If you forget, amend the commit (`git commit --amend -s`) or rebase the branch with `--signoff`.

**Why DCO instead of a CLA?** UFFDA isn't a legal entity yet. A Contributor License Agreement requires an entity on the receiving end to hold the granted rights cleanly. DCO is a contributor-side certification that doesn't depend on the project's legal structure. When UFFDA forms an entity later, DCO commits stay valid; no re-signing needed.

---

## Code of conduct

Be kind. Be honest. Be useful. Disagreement is fine; bad faith isn't. We'll remove what doesn't fit. Report issues to hello@uffda.ag.

---

## License of this CONTRIBUTING file

This file is part of the `uffda-ag/sandbox` repo, dual-licensed under **Apache 2.0** (as part of the source distribution) and **CC-BY 4.0** (for content reuse). See [LICENSE](./LICENSE) and [NOTICE](./NOTICE). UFFDA's full license posture is explained in plain English at [https://uffda.ag/license](https://uffda.ag/license) (live as of Sprint 16).

— UFFDA core
