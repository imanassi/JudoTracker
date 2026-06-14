/*
 * Judo Fighter Tracker — CORS proxy (Cloudflare Worker)
 * ----------------------------------------------------
 * Optional but recommended. The JudoManager data API blocks cross-origin browser
 * requests, so the app normally relies on shared public CORS proxies — which are
 * sometimes slow, rate-limited, or down. Deploying this tiny worker gives you your
 * own fast, reliable proxy that handles every call (GET, POST, and the large
 * schedule payload).
 *
 * Deploy (free, ~2 minutes):
 *   1. Go to https://dash.cloudflare.com  →  Workers & Pages  →  Create  →  Worker.
 *   2. Replace the template code with this file's contents and click Deploy.
 *   3. Copy your worker URL (e.g. https://judo-proxy.YOURNAME.workers.dev).
 *   4. In index.html set:
 *        const CUSTOM_PROXY = "https://judo-proxy.YOURNAME.workers.dev/?url=";
 *      (or, without editing files, run in the browser console once:
 *        localStorage.setItem('jm_proxy', 'https://judo-proxy.YOURNAME.workers.dev/?url='))
 *
 * Optional hardening: this proxy only forwards to datav2.judomanager.com, so it
 * can't be abused as an open relay.
 */

const ALLOWED_HOST = "datav2.judomanager.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return new Response("Missing ?url=", { status: 400, headers: CORS });

    let parsed;
    try { parsed = new URL(target); } catch { return new Response("Bad url", { status: 400, headers: CORS }); }
    if (parsed.hostname !== ALLOWED_HOST) {
      return new Response("Host not allowed", { status: 403, headers: CORS });
    }

    const init = {
      method: request.method,
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }

    const upstream = await fetch(parsed.toString(), init);
    const out = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  },
};
