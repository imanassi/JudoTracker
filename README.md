# Judo Fighter Tracker

A single-page web app to follow specific judoka in a [JudoManager portal](https://portal.judomanager.com)
tournament. Pick a tournament, add the fighters you care about, and see — for each
of them — **which mat they're on, how many fights ahead of them in the queue, who
they fight, and their results so far**. The data auto-refreshes while the event runs.

The app itself is one self-contained file — [`index.html`](index.html), no build step,
no dependencies. The extra files (`manifest.webmanifest`, `sw.js`, and the `*.png`
icons) just make it **installable on a phone** (see *Install it on your phone* below).

## How to use

1. Open the app (see *Running it* below).
2. **Choose a tournament** from the dropdown. It lists:
   - **Featured tournaments** — the events JudoManager is currently featuring
     (fetched live from `Competition/GetFeatured`).
   - **Recently used** — every tournament you've loaded before (remembered in your browser).
   - **➕ Enter a new tournament by URL / code** — for anything not in the lists above:
     paste the portal URL (e.g.
     `https://portal.judomanager.com/competition/tournoi_ecoliers_sierre_2026`)
     or just the code (`tournoi_ecoliers_sierre_2026`) and press **Load**.

   (The featured list is curated by JudoManager and won't contain every event — use the
   URL/code option for a specific local tournament that isn't featured.)
3. **Add fighters**, two ways:
   - **By name:** start typing a name (or club) and pick from the list of real entrants.
   - **By club:** choose a club from the *Browse a club* dropdown to see everyone
     entered from that club, then **Add** them individually or **Add all** at once.
   Add as many as you like; each one can be removed again from its **Added ✓** button,
   the *Following* chips, or its card.
4. Each fighter gets a card with their **next bout** (mat + queue position + the
   **belt colour they must wear** — White or Red) and a list of **all their bouts**
   (wins/losses with scores, the belt for each, and what's still to come).

5. **Export** gives a plain-text win/loss summary — one line per fighter,
   `Name <wins> win - <losses> lost` (byes don't count). Click **Export** to open a
   dialog where you can **Copy to clipboard** or **Download .txt**.

Followed fighters and recent tournaments are remembered in your browser
(`localStorage`), so they're still there next time you open the app.

You can also deep-link straight to a tournament:
`index.html#tournoi_ecoliers_sierre_2026`.

## Running it

The app reads live data from JudoManager's data service. That service blocks
cross-origin browser requests, so the app routes through a public CORS proxy
(see *How it works*). You still need to serve the page over http(s) — opening it
from `file://` may be blocked by the browser.

- **On your computer:** from this folder run a static server and open the page:
  ```
  python -m http.server 8777
  ```
  then visit <http://localhost:8777/>. (A ready-made config for the editor's
  preview is in `.claude/launch.json`.)
- **On your phone (at the venue):** host the folder on any static host
  (GitHub Pages, Netlify, etc.) and open it in the phone's browser. Or run the
  command above on a laptop and browse to the laptop's LAN IP from the phone
  (same Wi-Fi).

## Install it on your phone (no URL typing)

The app is a **PWA**, so it can be added to the home screen and launched full-screen
like a normal app — no browser, no URL.

**Requirement:** it must be served over **HTTPS** (the install/offline features don't
work from `file://` or plain-http LAN addresses). The easiest free option is
**GitHub Pages** or **Netlify** — upload the whole folder (it must include
`index.html`, `manifest.webmanifest`, `sw.js`, and the four `*.png` icons), then open
the resulting `https://…` link on your phone.

Then:
- **Android (Chrome):** tap **⤓ Install app** in the header (or browser menu →
  *Install app* / *Add to Home screen*).
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**.

After that it has its own home-screen icon (the 柔 logo) and opens full-screen. The app
itself works offline; the live results still need an internet connection to refresh.

## How it works

- Populates the *Featured tournaments* dropdown from
  `GET https://datav2.judomanager.com/api/Competition/GetFeatured?Language=en`
  (selecting one uses its `idCompetition`/`idExternal` directly — no extra lookup).
- For a pasted code, resolves it to an internal id via
  `GET https://datav2.judomanager.com/api/Competition/Info?idExternal=<code>`.
- Loads every contest with
  `GET https://datav2.judomanager.com/api/Contest/Find?IdCompetition=<id>&Language=en`,
  then does all the filtering (which fighter, which mat, results) in the browser.
- Builds the "follow" autocomplete from the real competitors in that contest list,
  and tracks each fighter by their stable `idPerson` (so name typos don't matter).
- **"When" they fight:** the API's scheduled clock times are often stale (events run
  behind), so the app leads with the **mat queue position** ("~N fights ahead on this
  mat"), computed from the not-yet-finished bouts on that mat, and shows the scheduled
  time only as secondary context.

### The CORS proxy caveat

`datav2.judomanager.com` only allows requests from `portal.judomanager.com`, and the
contest payload is ~3–5 MB — too big for most free CORS proxies. The app therefore
tries, in order: a direct call, then [`api.codetabs.com`](https://codetabs.com/cors-proxy/cors-proxy.html)
(which handles the large body), then `corsproxy.io` and `allorigins.win` for the
smaller calls.

The app tries several proxies in order (`cors.eu.org`, `api.codetabs.com`,
`corsproxy.io`, `allorigins.win`), each with its own timeout so a slow or
rate-limited one is skipped automatically.

This means **the app depends on a third-party proxy being up.** If loading ever fails,
that's the likely cause — wait a moment and it auto-retries, or press *Refresh now*.
For a permanent, self-owned setup, deploy a tiny proxy (e.g. a Cloudflare Worker) that
forwards to `datav2.judomanager.com` with `Access-Control-Allow-Origin: *`, and put it
first in the `PROXIES` list in `index.html`.
