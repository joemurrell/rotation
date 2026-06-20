# 🏀 Sub Rotation

A phone-friendly web app for youth basketball coaches to generate **fair, rules-compliant
substitution rotations** on game day — when you don't know until tip-off whether you'll
have 10 players, 9, or fewer.

It runs entirely in your browser. **All data stays on your phone** (no account, no server),
and it **works offline** at the gym once it's loaded.

## What it does

- **Multiple teams**, each in its own division with its own sub rules:
  - **Pee Wee** — four 6-minute quarters, sub at the end of each quarter (4 periods). No
    player plays more than 2 quarters in a row when avoidable; exactly 10 present → two
    platoons of 5 alternate.
  - **Mighty Might** — four 10-minute quarters split at the midpoint (8 five-minute periods).
    Everyone sits at least one period unless 6 or fewer are present.
- **Check who's present** at a game and **auto-generate** a balanced rotation.
- **Adjust for real life:** a player who leaves at halftime or arrives late (availability
  window), or **front-load** a kid's minutes earlier in the game. The court is always
  re-filled around them.
- **Tweak by hand:** tap any cell to sub a player on/off or tag a position.
- **Live mode:** big courtside view showing who subs **IN / OUT** at each break.
- **Season tracking:** cumulative minutes, periods, and games per player (and time by
  position if you tag them). Mark a game "final" to add it to the totals.
- **Backup / restore:** export everything to a JSON file and import it on another device.

When a rule can't be satisfied (e.g. only 6–7 players, so someone *must* play 3 in a row),
the app generates the fairest option and shows a **warning** instead of silently breaking it.

## Run it on your phone

It's hosted on **GitHub Pages**:

1. In this repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   branch **`main`**, folder **`/ (root)`**, then **Save**.
2. After a minute it's live at **`https://joemurrell.github.io/rotation/`**.
3. Open that on your phone, then **Add to Home Screen** (Share menu on iPhone) so it opens
   like an app and works without signal.

> Because data lives in the browser, use the same browser each game. Use **Backup → Download**
> now and then, and **Import** it if you switch phones.

## Develop / run locally

No build step. Serve the folder over HTTP (ES modules need it) and open it:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/
```

## Tests

Open **`tests/rotation.test.html`** in a browser (via the local server above). It runs the
rotation generator across both divisions and 5–10 players and asserts fairness,
consecutive-period limits, the sit-one rule, availability windows, and front-loading.

## How it's built

Plain HTML + CSS + vanilla JavaScript (ES modules) — no framework, no dependencies, no CDNs.

| File | Purpose |
|---|---|
| `js/rules.js` | Per-division config (periods, minutes, constraints) |
| `js/rotation.js` | The rotation generator + validator (pure functions) |
| `js/store.js` | localStorage persistence, teams/roster/games CRUD, export/import |
| `js/stats.js` | Season aggregation from finalized games |
| `js/ui.js` | Screens and event wiring |
| `js/app.js` | Entry point + service-worker registration |
| `service-worker.js` | Offline app-shell cache |

### Replacing the app icon
`icons/icon.svg` is a simple placeholder. Swap it for your own (or add PNG sizes and list
them in `manifest.webmanifest`) for a nicer home-screen icon.
