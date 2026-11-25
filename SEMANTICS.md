# What the sample demo simplifies, on purpose

The "payments network" in `index.html` is a teaching sample with hand-written matching logic (`analyze()` in the `<script>`), not a reimplementation of Tailscale's real policy engine. That's a deliberate scope cut, not an oversight, and it's worth being explicit about where it diverges, in case anyone technical asks. The "Verified against my own tailnet" panel exists specifically so the demo never has to claim the sample logic IS the real engine: for the one part that matters (an actual allow/deny answer), it shows the real server's own answer instead of mine.

## Where the sample's logic diverges from the real grants engine

1. **Single-tag destination matching vs. real tag/owner resolution.** The sample compares one opaque string (`tag:payments-db`) against a grant's `dst` list. The real engine resolves a destination through `tagOwners`, a node's actual tag set (a device can carry several tags), its Tailscale IPs, and subnet routes it advertises, matching is against all of that, not one label.

2. **`autogroup:self` is hardcoded, not relational.** The sample special-cases `destId === "macbook" && src === "laptop"`. The real `autogroup:self` means "the requesting user's own devices," evaluated against actual device ownership, it has nothing to do with my two fixed IDs.

3. **SSH is one boolean (`g.app`), not two layered checks.** Real Tailscale SSH access requires a network-reachability grant (or legacy ACL rule) **and** a separate top-level `ssh` block (`action: "check"` or `"accept"`, with its own `src`/`dst`/`users`). My own real policy (fetched via the script) has exactly this: a default allow-all grant, plus a separate `ssh` rule with `action: "check"`. The sample conflates both into a single "is SSH granted" flag.

4. **First-match-wins vs. match-any.** The sample's `analyze()` loop stops at the first grant that matches and reports only that one. Tailscale's real model has no explicit deny action, access is allowed if *any* grant matches, so multiple grants can simultaneously apply. The end allow/deny verdict comes out the same either way (there's nothing to override), but a real admin tool would report every matching grant, not just the first.

5. **No device posture.** Real grants can carry `srcPosture` conditions (OS version, auto-update status, disk encryption, etc.). The sample has no concept of posture at all.

6. **Ports as exact strings, not resolved CIDR/port-set semantics.** The sample compares `"tcp:443"` as a literal string. The real engine resolves `ip` entries (including `*`, specific ports, and address ranges) against the actual destination.

## Why this is fine for what the demo is for

The demo's job is to pitch a product idea, admin-facing, pre-connect, near-miss-aware access tracing, not to be a drop-in ACL engine. The sample's simplified matching is enough to show the *interaction* (a device joins, gets traced automatically, and a decision path with near misses and a suggested fix shows up on its own) clearly and fast, screen-shared in under two minutes.

What it can't do honestly is stand in for "I reimplemented your policy engine." So it doesn't try to. The real API calls in `scripts/tailscale-fetch.mjs` and the verification panel in `index.html` carry that weight instead, they show the actual server computing an actual answer against an actual tailnet, with no approximation in between.

## What I'd build first if this became a real feature

1. Call `POST /acl/preview` server-side for the actual verdict, and keep the decision-path narration purely as a presentation layer over its real response, not a second implementation of the matching logic.
2. Extend the near-miss reasoning to work from the real `grants`/`acls` structure directly (iterate the posted policy's own rules, not a hand-rolled array), so "near miss" is computed from whatever policy is actually loaded, including tags, groups, and posture.
3. Layer the `ssh` block in as its own explicit second check, matching how the real engine actually gates SSH.
