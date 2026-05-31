# Judo Fighter Tracker

A single-page web app to follow specific judoka in a [JudoManager portal](https://portal.judomanager.com)
tournament. Pick a tournament, add the fighters you care about, and see — for each
of them — **which mat they're on, how many fights ahead of them in the queue, who
they fight, and their results so far**. The data auto-refreshes while the event runs.

It's one self-contained file: [`index.html`](index.html). No build step, no dependencies.

## How to use

1. Open the app (see *Running it* below).
2. **Choose a tournament:** pick a previously-used tournament from the dropdown,
   or choose **➕ Enter a new tournament…** and paste the portal URL (e.g.
   `https://portal.judomanager.com/competition/tournoi_ecoliers_sierre_2026`)
   or just the code (`tournoi_ecoliers_sierre_2026`), then press **Load**.
   Every tournament you load is remembered and appears in the dropdown next time.
3. **Add fighters:** start typing a name (or club) and pick from the list of real
   entrants. Add as many as you like.
4. Each fighter gets a card with their **next bout** (mat + queue position) and a
   list of **all their bouts** (wins/losses with scores, and what's still to come).

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
- **On your phone (at the venue):** host `index.html` on any static host
  (GitHub Pages, Netlify, etc.) and open it in the phone's browser. Or run the
  command above on a laptop and browse to the laptop's LAN IP from the phone
  (same Wi-Fi).

## How it works

- Resolves the tournament code to an internal id via
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

This means **the app depends on a third-party proxy being up.** If loading ever fails,
that's the likely cause. For a permanent, self-owned setup, deploy a tiny proxy (e.g.
a Cloudflare Worker) that forwards to `datav2.judomanager.com` with
`Access-Control-Allow-Origin: *`, and point `PROXIES` in `index.html` at it.
