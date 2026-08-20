# Traccoon plugins

Self-contained views for [Traccoon](https://github.com/mcules/Traccoon). A plugin is a zip
with a `manifest.json`, installed under *Settings → Plugins*.

## Why a repository of its own

Traccoon needs no map. What it needs are data series, sharing and triggers — drawing them is
exchangeable. Building a plugin here also means someone else can do it better without
touching the core.

## How a plugin gets data

Not directly. It runs in an iframe **without** `allow-same-origin`, so it has no origin, no
access to the login token and none to the API; the delivered CSP additionally sets
`connect-src 'none'`. Everything goes through the host:

```html
<script src="/api/plugins/_bridge.js"></script>
<script>
  const me     = await traccoon.me();
  const series = await traccoon.live("location");
  const points = await traccoon.points("tracker.phone", { from: "2026-08-01T00:00:00Z" });
  const places = await traccoon.places();
  await traccoon.store.create("notes", { text: "hello" });
</script>
```

The host measures every call against two things: what the manifest declares under `reads`,
and what an admin has ticked off. Both have to hold, otherwise a refusal comes back instead
of data. A plugin therefore never sees more than the logged-in person may see — grants on
series apply automatically.

## Manifest

```json
{
  "slug": "map",
  "name": "Map",
  "version": "0.2.0",
  "icon": "🗺️",
  "entry": "index.html",
  "contributions": [{ "type": "page", "path": "", "label": "Map", "icon": "🗺️" }],
  "reads": ["series:location"],
  "csp": { "img-src": ["https://tile.openstreetmap.org"] },
  "allowed_hosts": [],
  "table_schema": { "notes": { "text": "string" } }
}
```

| Field | What for |
|-------|----------|
| `slug` | address (`/p/<slug>`) and identity. Letters, digits, `-` and `_` only |
| `contributions` | what appears in the menu. `path` is appended as an anchor when a plugin has several pages |
| `reads` | requested rights: `series:number`, `series:location`, `series:text` |
| `csp` | extra sources. Only `img-src`, `style-src`, `font-src`, `media-src` — scripts from foreign hosts do not exist |
| `allowed_hosts` | counterparts for `POST /api/plugins/<slug>/fetch` (SSRF-checked) |
| `table_schema` | the plugin's own storage, reachable through `traccoon.store.*` |

Third-party libraries belong in the zip (see `map/vendor/`), not in a CDN — the CSP loads no
foreign scripts, and a plugin should start without internet.

## Build and install

```sh
./build.sh              # one zip per directory, under build/
./build.sh map          # just one
```

Then upload the zip under *Settings → Plugins* and tick the requested rights. A new version
replaces the old one; rights already granted stay, newly requested ones start at "not
allowed" again.

## What lives here

| Plugin | For |
|--------|-----|
| `map` | location series on a map: track, last position, named places, time scrubber |
| `hello` | example and proof of the bridge — also shows what a refusal looks like |
