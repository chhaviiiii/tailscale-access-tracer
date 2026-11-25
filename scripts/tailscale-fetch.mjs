#!/usr/bin/env node
// Pulls your REAL tailnet's devices + policy from the real Tailscale API,
// then runs the real /acl/preview and /acl/validate endpoints against it.
// This never prints or writes your token anywhere. Everything it writes to
// data/ is gitignored.
//
// Endpoints used (from https://tailscale.com/api, read directly, not guessed):
//   GET  /tailnet/{tailnet}/devices
//   GET  /tailnet/{tailnet}/acl
//   POST /tailnet/{tailnet}/acl/preview?type=user&previewFor=<user>
//   POST /tailnet/{tailnet}/acl/validate
//
// Usage:
//   cp .env.example .env   # then fill in TS_API_TOKEN yourself
//   node scripts/tailscale-fetch.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "data");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(join(ROOT, ".env"));

const TOKEN = process.env.TS_API_TOKEN;
const TAILNET = process.env.TS_TAILNET || "-";
const BASE = "https://api.tailscale.com/api/v2";

if (!TOKEN) {
  console.error(
    "Missing TS_API_TOKEN.\n" +
    "1. Go to https://console.tailscale.com/admin/settings/keys\n" +
    "2. Generate an access token (1 day expiry is enough)\n" +
    "3. cp .env.example .env, then paste it into .env yourself (TS_API_TOKEN=...)\n" +
    "This script reads .env locally — it is never sent anywhere but api.tailscale.com, and never printed."
  );
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(TOKEN + ":").toString("base64");

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, body: json };
}

function save(name, obj) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, name), JSON.stringify(obj, null, 2));
}

async function main() {
  console.log(`Tailnet: ${TAILNET} (never printing the token)`);

  console.log("GET  /tailnet/{tailnet}/devices ...");
  const devicesRes = await api("GET", `/tailnet/${TAILNET}/devices`);
  if (!devicesRes.ok) {
    console.error("Devices call failed:", devicesRes.status, devicesRes.body);
    process.exit(1);
  }
  const devices = devicesRes.body.devices || [];
  save("devices.json", devicesRes.body);
  console.log(`  -> ${devices.length} device(s)`);

  console.log("GET  /tailnet/{tailnet}/acl ...");
  const aclRes = await api("GET", `/tailnet/${TAILNET}/acl`);
  if (!aclRes.ok) {
    console.error("ACL call failed:", aclRes.status, aclRes.body);
    process.exit(1);
  }
  const acl = aclRes.body;
  save("acl.json", acl);
  const ruleCount = (acl.acls?.length || 0) + (acl.grants?.length || 0);
  console.log(`  -> ${ruleCount} rule(s), ${Object.keys(acl.groups || {}).length} group(s), ${Object.keys(acl.tagOwners || {}).length} tag(s)`);

  const previewFor = process.env.TS_PREVIEW_USER || devices[0]?.user;
  let previewResult = null;
  if (previewFor) {
    console.log(`POST /tailnet/{tailnet}/acl/preview?type=user&previewFor=${previewFor} ...`);
    const previewRes = await api(
      "POST",
      `/tailnet/${TAILNET}/acl/preview?type=user&previewFor=${encodeURIComponent(previewFor)}`,
      acl
    );
    previewResult = { request: { type: "user", previewFor }, status: previewRes.status, ...previewRes.body };
    save("preview-result.json", previewResult);
    console.log(`  -> ${previewRes.body.matches?.length ?? 0} matching rule(s) for ${previewFor}`);
  } else {
    console.log("Skipping /acl/preview — no device owner found to preview for.");
  }

  const tests = acl.tests || [];
  console.log(`POST /tailnet/{tailnet}/acl/validate (${tests.length} test(s) defined in your policy) ...`);
  const validateRes = await api("POST", `/tailnet/${TAILNET}/acl/validate`, tests);
  const validateResult = { testCount: tests.length, status: validateRes.status, ...validateRes.body };
  save("validate-result.json", validateResult);
  if (tests.length === 0) {
    console.log("  -> Your policy has no `tests` block, so there is nothing for /acl/validate to check. That's the gap this demo is about.");
  } else if (validateRes.ok) {
    console.log(`  -> All ${tests.length} test(s) passed.`);
  } else {
    console.log(`  -> ${validateRes.body.data?.length ?? "some"} test(s) failed:`, validateRes.body.message);
  }

  save("summary.json", {
    fetchedAt: new Date().toISOString(),
    tailnet: TAILNET,
    deviceCount: devices.length,
    ruleCount,
    groupCount: Object.keys(acl.groups || {}).length,
    tagCount: Object.keys(acl.tagOwners || {}).length,
    previewFor: previewFor || null,
    previewMatchCount: previewResult?.matches?.length ?? null,
    testCount: tests.length,
    validatePassed: tests.length > 0 ? validateRes.ok : null,
  });

  console.log("\nDone. Wrote data/devices.json, data/acl.json, data/preview-result.json, data/validate-result.json, data/summary.json");
  console.log("None of these contain your token. They're gitignored, but still your real network info — don't post them publicly.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
