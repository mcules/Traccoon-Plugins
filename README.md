# Traccoon-Plugins

Eigenständige Oberflächen für [Traccoon](https://github.com/mcules/Traccoon). Ein Plugin ist
ein Zip mit einer `manifest.json`; eingespielt wird es unter *Einstellungen → Plugins*.

## Warum ein eigenes Repo

Traccoon selbst braucht keine Karten. Was es braucht, sind Datenreihen, Freigaben und
Auslöser — die Darstellung ist austauschbar. Ein Plugin hier zu bauen heißt deshalb auch:
Es kann jemand anders besser machen, ohne den Kern anzufassen.

## Wie ein Plugin an Daten kommt

Gar nicht direkt. Es läuft in einem iframe **ohne** `allow-same-origin`, hat also keine
Herkunft, keinen Zugriff auf den Anmeldetoken und keinen auf die API; die ausgelieferte CSP
setzt zusätzlich `connect-src 'none'`. Alles läuft über den Wirt:

```html
<script src="/api/plugins/_bruecke.js"></script>
<script>
  const ich    = await traccoon.ich();
  const reihen = await traccoon.live("location");
  const punkte = await traccoon.punkte("handy.s26-ultra", { von: "2026-08-01T00:00:00Z" });
  const orte   = await traccoon.orte();
</script>
```

Der Wirt misst jeden Ruf an zwei Dingen: was das Manifest unter `liest` anmeldet, und was ein
Admin davon abgehakt hat. Beides muss stimmen, sonst kommt eine Absage statt Daten. Ein
Plugin sieht damit nie mehr, als der angemeldete Mensch selbst sehen darf — Freigaben an
Reihen gelten automatisch mit.

## Manifest

```json
{
  "slug": "karte",
  "name": "Karte",
  "version": "0.1.0",
  "icon": "🗺️",
  "entry": "index.html",
  "contributions": [{ "typ": "seite", "pfad": "", "label": "Karte", "icon": "🗺️" }],
  "liest": ["series:location"],
  "csp": { "img-src": ["https://tile.openstreetmap.org"] },
  "allowed_hosts": [],
  "table_schema": { "notizen": { "text": "string" } }
}
```

| Feld | wofür |
|------|-------|
| `slug` | Adresse (`/p/<slug>`) und Kennung. Nur Buchstaben, Ziffern, `-` und `_` |
| `contributions` | was im Menü erscheint. `pfad` wird als Anker angehängt, wenn ein Plugin mehrere Seiten hat |
| `liest` | angeforderte Rechte: `series:number`, `series:location`, `series:text` |
| `csp` | zusätzliche Quellen. Nur `img-src`, `style-src`, `font-src`, `media-src` — Skripte von fremden Rechnern gibt es nicht |
| `allowed_hosts` | Gegenstellen für `POST /api/plugins/<slug>/fetch` (SSRF-geprüft) |
| `table_schema` | eigene Ablage des Plugins, erreichbar über `traccoon.ablage.*` |

Fremde Bibliotheken gehören ins Zip (siehe `karte/vendor/`), nicht in ein CDN — die CSP
lässt keine fremden Skripte zu, und ein Plugin soll auch ohne Internet starten.

## Bauen und einspielen

```sh
./bauen.sh              # macht aus jedem Verzeichnis ein Zip unter build/
./bauen.sh karte        # nur eines
```

Danach das Zip unter *Einstellungen → Plugins* hochladen und die geforderten Rechte abhaken.
Eine neue Fassung überschreibt die alte; bereits erteilte Rechte bleiben, neu geforderte
fangen wieder bei „nicht erlaubt" an.

## Was hier liegt

| Plugin | wozu |
|--------|------|
| `karte` | Standortreihen auf einer Karte: Spur, letzte Position, benannte Orte, Zeitschieber |
| `hallo` | Beispiel und Nachweis der Brücke — zeigt auch, wie eine Absage aussieht |
