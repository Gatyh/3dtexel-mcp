#!/usr/bin/env node
/**
 * @3dtexel/mcp — local stdio bridge to the 3D Texel remote MCP server.
 *
 * The tools live on the server (https://3dtexel.com/wp-json/3dtexel-api/v1/mcp): this bridge only forwards JSON-RPC
 * messages between a local MCP client (Claude Desktop, Cursor, Windsurf, Cline, Zed…) and that endpoint, adding the
 * user's API key. No tool logic here, so the package never needs an update when tools change.
 *
 *   npx -y @3dtexel/mcp            run the bridge (stdio)          env: TEXEL_API_KEY (optional), TEXEL_MCP_URL
 *   npx -y @3dtexel/mcp login      connect your account (you approve on 3dtexel.com; the key is stored locally)
 *   npx -y @3dtexel/mcp status     show the connected account and balance
 *   npx -y @3dtexel/mcp logout     revoke the stored key and delete it
 *
 * Zero runtime dependencies (Node >= 18: global fetch). The API key is never printed and never sent anywhere else
 * than 3dtexel.com over HTTPS.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const VERSION = "1.0.0";
const BASE = (process.env.TEXEL_API_BASE || "https://3dtexel.com/wp-json/3dtexel-api/v1").replace(/\/+$/, "");
const MCP_URL = process.env.TEXEL_MCP_URL || `${BASE}/mcp`;
const UA = `3dtexel-mcp/${VERSION} (node ${process.versions.node}; ${platform()})`;

                                    

function configDir()         {
  if (process.env.TEXEL_CONFIG_DIR) return process.env.TEXEL_CONFIG_DIR;
  if (platform() === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "3dtexel");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "3dtexel");
}
const CRED_FILE = join(configDir(), "credentials.json");

function storedKey()         {
  try {
    const j = JSON.parse(readFileSync(CRED_FILE, "utf8"))                        ;
    return typeof j.api_key === "string" ? j.api_key : "";
  } catch {
    return "";
  }
}

function apiKey()         {
  const k = (process.env.TEXEL_API_KEY || "").trim();
  if (k && k !== "tx_live_...") return k;
  return storedKey();
}

function assertSafeKey(key        )       {
  // Never send a key over plain HTTP or to another host by mistake.
  const u = new URL(MCP_URL);
  if (key && u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error("Refusing to send the API key over plain HTTP.");
  }
}

const log = (...a           ) => process.stderr.write(`[3dtexel-mcp] ${a.map(String).join(" ")}\n`);

// ── stdio bridge ───────────────────────────────────────────────────────────

async function forward(message        , key        )                         {
  const headers                         = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": UA,
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(MCP_URL, { method: "POST", headers, body: message, signal: AbortSignal.timeout(120_000) });
  if (res.status === 202 || res.status === 204) return null;
  const text = await res.text();
  if (res.ok) return text.trim() || null;
  // HTTP error (401 bad key, 429 rate limit, 5xx): turn it into a JSON-RPC error for each request id.
  let detail = `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text)                                                   ;
    if (j.error?.message) detail = j.error.message + (j.error.hint ? ` ${j.error.hint}` : "");
  } catch { /* not JSON */ }
  throw new Error(detail);
}

function errorsFor(message        , text        )                {
  let parsed         ;
  try { parsed = JSON.parse(message); } catch { return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const out = list
    .filter((m)            => !!m && typeof m === "object" && "id" in (m        ) && "method" in (m        ))
    .map((m) => ({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: `3D Texel: ${text}` } }));
  if (!out.length) return null;
  return JSON.stringify(Array.isArray(parsed) ? out : out[0]);
}

async function bridge()                {
  const key = apiKey();
  assertSafeKey(key);
  log(`v${VERSION} -> ${MCP_URL} (${key ? "account connected" : "no API key: public tools only; run \"npx -y @3dtexel/mcp login\""})`);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = 0;
  let closed = false;
  const done = () => { if (closed && pending === 0) process.exit(0); };
  rl.on("line", (line) => {
    const msg = line.trim();
    if (!msg) return;
    pending++;
    forward(msg, key)
      .then((out) => { if (out) process.stdout.write(out.replace(/\r?\n/g, " ") + "\n"); })
      .catch((e       ) => {
        log("error:", e.message);
        const err = errorsFor(msg, e.name === "TimeoutError" ? "the server did not answer in time. If you started a generation, check it with get_generation: nothing is charged twice." : e.message);
        if (err) process.stdout.write(err + "\n");
      })
      .finally(() => { pending--; done(); });
  });
  rl.on("close", () => { closed = true; done(); });
}

// ── account commands ───────────────────────────────────────────────────────

async function api(path        , init                                 = {})                                          {
  const headers                         = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA };
  if (init.key) headers.Authorization = `Bearer ${init.key}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  let json       = {};
  try { json = (await res.json())        ; } catch { /* empty */ }
  return { status: res.status, json };
}

const sleep = (ms        ) => new Promise((r) => setTimeout(r, ms));

async function login()                {
  const start = await api("/auth/device", {
    method: "POST",
    body: JSON.stringify({ client_name: `MCP on ${hostname()}`.slice(0, 60), scopes: ["read", "download", "generate", "billing"] }),
  });
  if (start.status !== 200) throw new Error(`Could not start the login (${start.status}): ${JSON.stringify(start.json)}`);
  const s = start.json                                                                                                                       ;
  process.stdout.write(
    `\nOpen this page, sign in (or create a free account) and approve the connection:\n\n  ${s.verification_uri_complete}\n\n` +
      `Check that the code shown there is ${s.user_code}. You choose the permissions and the daily credit limit.\nWaiting for approval…\n`,
  );
  let interval = Math.max(5, s.interval || 5) * 1000;
  const deadline = Date.now() + (s.expires_in || 600) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await api("/auth/device/token", { method: "POST", body: JSON.stringify({ device_code: s.device_code }) });
    if (r.status === 200 && typeof r.json.api_key === "string") {
      mkdirSync(configDir(), { recursive: true });
      writeFileSync(CRED_FILE, JSON.stringify({ api_key: r.json.api_key, created: new Date().toISOString(), scopes: r.json.scopes, daily_credit_cap: r.json.daily_credit_cap }, null, 2), { mode: 0o600 });
      try { chmodSync(CRED_FILE, 0o600); } catch { /* Windows */ }
      process.stdout.write(`\nConnected. Key stored in ${CRED_FILE} (never shown). Daily credit cap: ${r.json.daily_credit_cap}.\nRestart your MCP client.\n`);
      return;
    }
    const code = (r.json.error                    )?.code;
    if (code === "authorization_pending") continue;
    if (code === "slow_down") { interval += 5000; continue; }
    throw new Error(code === "access_denied" ? "The connection was refused." : `Login failed (${r.status}): ${JSON.stringify(r.json)}`);
  }
  throw new Error("The code expired. Run login again.");
}

async function status()                {
  const key = apiKey();
  if (!key) { process.stdout.write("Not connected. Run: npx -y @3dtexel/mcp login\n"); return; }
  const r = await api("/me", { key });
  if (r.status !== 200) { process.stdout.write(`Key rejected (${r.status}). Run login again.\n`); return; }
  const me = r.json                                                                                                                                 ;
  process.stdout.write(`Connected as ${me.user.display_name}. Balance: ${me.credits} credits. Scopes: ${me.key.scopes.join(", ")}. Today: ${me.key.spent_today}/${me.key.daily_credit_cap} credits.\n`);
}

async function logout()                {
  const key = storedKey();
  if (key) await api("/auth/key", { method: "DELETE", key }).catch(() => undefined);
  if (existsSync(CRED_FILE)) rmSync(CRED_FILE);
  process.stdout.write("Disconnected: key revoked and removed.\n");
}

// ── main ───────────────────────────────────────────────────────────────────

const cmd = process.argv[2] || "";
const run = { "": bridge, serve: bridge, login, status, logout }                                       ;
if (cmd === "--version" || cmd === "-v") {
  process.stdout.write(VERSION + "\n");
} else if (!run[cmd]) {
  process.stdout.write("Usage: 3dtexel-mcp [login|status|logout]\n");
  process.exit(1);
} else {
  run[cmd]().catch((e       ) => { log(e.message); process.exit(1); });
}
