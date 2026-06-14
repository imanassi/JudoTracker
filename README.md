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
(`localStorage`), so they're still there next time you open the app. The **open
tournament is also kept for 24h** — refreshing or reopening the app drops you straight
back into it (until you pick a different one via *Change tournament*).

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
- **Android (Chrome):** browser menu (⋮) → *Install app* / *Add to Home screen*.
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**.

After that it has its own home-screen icon (the 柔 logo) and opens full-screen. The app
itself works offline; the live results still need an internet connection to refresh.

## How it works

- Populates the *Featured tournaments* dropdown from
  `GET https://datav2.judomanager.com/api/Competition/GetFeatured?Language=en`
  (selecting one uses its `idCompetition`/`idExternal` directly — no extra lookup).
- For a pasted code, resolves it to an internal id via
  `GET https://datav2.judomanager.com/api/Competition/Info?idExternal=<code>`.
- Builds the roster (search + club browser) from the **registered competitors**:
  `POST https://datav2.judomanager.com/api/Competition/GetCompetitors`
  `{ "idCompetition": <id>, "language": "en" }`. This works **before the draw is
  published**, so you can pick fighters and browse clubs for an upcoming event.
- Loads the schedule from `Contest/Find`, **per fragment**: it first gets the
  competition's time-blocks (`Competition/GetCompCompetitionsFragments`) and then
  queries `Contest/Find?IdCompetition=<id>&IdFragment=<frag>` for each. This matters —
  for many tournaments the plain `Contest/Find` (no fragment) returns *empty* and the
  contests only come back per fragment; the per-fragment payloads are also smaller, so
  they proxy more reliably. All the filtering (which fighter, which mat, results) is
  done in the browser. The schedule is empty until the draw is made; the roster still
  works in the meantime, and the two loads are independent (one can fail without
  breaking the other).
- Tracks each fighter by their stable `idPerson`, so name typos don't matter.
- **"When" they fight:** the API's scheduled clock times are often stale (events run
  behind), so the app leads with the **mat queue position** ("~N fights ahead on this
  mat"), computed from the not-yet-finished bouts on that mat, and shows the scheduled
  time only as secondary context.

### The CORS proxy caveat

`datav2.judomanager.com` only allows requests from `portal.judomanager.com`, so a
standalone page can't call it directly — requests are routed through a CORS proxy.
The app **races several public proxies in parallel** (`corsproxy.io`,
`api.codetabs.com`, `cors.eu.org`, `allorigins.win`) and uses whichever responds
first. Racing matters because *which* proxy works varies by device and network — one
phone may get through `codetabs` while another can't — and a slow/dead proxy no longer
blocks the others. `corsproxy.io` handles the small calls (and is the only one that
forwards the `POST` roster); the others cover the **large schedule payload** (~3–5 MB
for a big event) that `corsproxy.io` rejects.

To reduce blank screens, the app also **caches the last loaded schedule** (per
tournament) — so the "next match" still shows after a reload / app relaunch, and when a
refresh fails, instead of going blank. The status line then reads
*"showing last schedule — couldn't refresh"*.

Still, **the public-proxy path depends on a third party being up**, and on a busy
event day they can be unreliable from some networks. **For a rock-solid connection on
every device, run your own proxy** — strongly recommended if more than one person will
use this:

1. Deploy [`cloudflare-worker.js`](cloudflare-worker.js) — a ~30-line free Cloudflare
   Worker (instructions are in the file header, ~2 minutes).
2. Point the app at it, either:
   - **in the app:** open the header menu (☰) → **Reliable data connection…** and paste
     the worker URL (ending in `?url=`) — no file editing, and it syncs to that device, or
   - edit `index.html`: `const CUSTOM_PROXY = "https://…workers.dev/?url=";`

Once set, the app uses your worker first (it handles POST and the large schedule), and
the public proxies become irrelevant.

The file's header has step-by-step deploy instructions.
