# uffda-ag/sandbox

The contribution lane for [UFFDA](https://uffda.ag) — Unified Farm & Field Data Alliance.

UFFDA's main app lives at [uffda-ag/uffda](https://github.com/uffda-ag/uffda). This repo is where the community publishes **tiles**: small things that read or extend what UFFDA shows. A tile is a game, a layer, an explainer, a calculator, a link card — anything that fits on the [/sandbox](https://uffda.ag/sandbox) shelf and gives a user something to do.

We accept three flavors of tile. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the contribution paths and the tile schema.

| Lane | What it is | When it fits |
| --- | --- | --- |
| **Iframe widget** | A self-contained mini-app loaded in an iframe on /sandbox. Your code, your CSS, your dependencies. | Games, calculators, explorers — anything that wants its own little canvas. The primary lane. |
| **Native React widget** | A React component that ships into the main app's build. | Tools that need to reach into UFFDA's state (selected field, AOI, layer metadata) without iframe round-trips. |
| **Link card** | A card pointing to something hosted elsewhere. | Notebooks, blog posts, third-party tools, anything off-platform we want to surface. |

Every tile gets:
- A `tile.json` manifest (name, type, status, license, author, tags).
- Access to the read-only `window.uffda` API — current AOI, selected field, layer license metadata. Iframe tiles get it via `postMessage`; native React tiles import it directly. Full contract in [CONTRIBUTING.md](./CONTRIBUTING.md#the-windowuffda-api).
- A spot on the gallery, sortable by recency / popularity / type / featured.

## What's here

```
sandbox/
├── README.md           you are here
├── LICENSE             MIT for the wrapper code; tiles declare their own license
├── CONTRIBUTING.md     three contribution paths + the tile schema
├── tile.schema.json    JSON Schema for tile.json files (every tile validates against this)
└── tiles/
    ├── iframe/         iframe widget tiles, one folder per tile
    ├── react/          native React widget tiles, one folder per tile
    └── link/           link card tiles, one folder per tile (tile.json only)
```

## How tiles reach the live site

When a tile PR merges to `main` here, the next deploy of [uffda-ag/uffda](https://github.com/uffda-ag/uffda) pulls the updated tile manifest and renders the tile on [/sandbox](https://uffda.ag/sandbox). No coordination needed — submit here, it ships there.

## License

This repo's wrapper code, schema, and docs are MIT-licensed. Each tile declares its own license in `tile.json` — wide latitude (MIT, CC-BY, CC0, Apache 2.0, public domain). Tiles whose declared license conflicts with UFFDA's public-data ethos won't be merged.

— [@uffda-ag](https://github.com/uffda-ag)
