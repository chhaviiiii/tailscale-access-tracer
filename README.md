# Access Tracer: Tailscale interview demo

Prototype of a missing Tailscale feature: as devices join the tailnet and request paths, it traces each one against the policy automatically, no one has to click anything, and shows exactly which access grant matched, or why the request was blocked by default, including near-misses, so an admin fixes the right rule instead of guessing. Shaped around a payments/fraud network, not a borrowed lab.

Related open request: [tailscale/tailscale#11618](https://github.com/tailscale/tailscale/issues/11618)

## Run (10 seconds)

```bash
cd ~/Downloads/tailscale-fde-demo
open index.html
```

## How it works

Opening `index.html` starts it tracing on its own, a new device joins every few seconds and gets checked against the policy automatically. Use **Pause**/**Resume** at the top of the activity feed to control pacing, and **Restart** to run the sequence again. Click any past entry in the feed to pull its reasoning back up.

1. Fraud engineer laptop joins → fraud-dashboard, browser → **open**
2. Same device → payments-db, secure shell → **blocked**, with the near-miss shown (matched person, wrong action)
3. Contractor device joins → staging-web, browser → **open**
4. Same contractor → payments-api, browser → **blocked**
5. Your MacBook joins → macbook-pro, secure shell → **open** (mirrors the real Tailscale console's own SSH setup screen)
6. Break-glass account joins → payments-db, secure shell → **open** (rare emergency path)
7. Scroll to **Verified against my own tailnet**: real API calls against a real tailnet, not a mock (see below)

## Verified against a real tailnet, not just the sample

The payments network in the main demo is a hand-written sample that autoplays, good for narrating an interaction, not proof that the matching logic equals Tailscale's real policy engine. `scripts/tailscale-fetch.mjs` calls the real API (`GET /acl`, `GET /devices`, `POST /acl/preview`, `POST /acl/validate`) against your own tailnet and writes the results to `data/` (gitignored). `index.html`'s bottom panel shows that real output, privacy-masked, baked in statically.

To refresh it before the call:

```bash
cp .env.example .env   # then paste a fresh token on the TS_API_TOKEN= line yourself
node scripts/tailscale-fetch.mjs
```

Generate the token at [console.tailscale.com/admin/settings/keys](https://console.tailscale.com/admin/settings/keys), 1-day expiry is enough. The script never prints or stores it anywhere but your local `.env`.

See [`SEMANTICS.md`](SEMANTICS.md) for exactly where the sample's hand-written matching logic simplifies the real grants engine (tag resolution, `autogroup:self`, SSH's two-layer check, posture, match-any vs. first-match).

## Files

- `index.html`, the interactive Access Tracer
- `SEMANTICS.md`, where the sample's matching logic diverges from Tailscale's real grants engine, and why
- `scripts/tailscale-fetch.mjs`, pulls your real tailnet's ACL/devices and calls the real preview/validate endpoints
- `.env.example`, copy to `.env` and fill in your own API token (gitignored, never touches this repo)
