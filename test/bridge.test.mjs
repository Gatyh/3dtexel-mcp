// Test of the stdio bridge against a local mock of the remote MCP endpoint (no network, no real account).
// Run: node test/bridge.test.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seen = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ auth: req.headers.authorization || "", body });
    let msg;
    try { msg = JSON.parse(body); } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
    }
    if (!("id" in msg)) { res.writeHead(202); return res.end(); }
    if (msg.method === "boom") { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: { code: "unauthorized", message: "Invalid API key.", hint: "Create one." } })); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { echo: msg.method } }) + "\n");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/mcp`;

const child = spawn(process.execPath, [join(here, "..", "dist", "index.js")], {
  env: { ...process.env, TEXEL_MCP_URL: url, TEXEL_API_KEY: "tx_live_test", TEXEL_CONFIG_DIR: join(here, ".tmp-none") },
  stdio: ["pipe", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => (out += d));
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({ jsonrpc: "2.0", id: 3, method: "boom" });
child.stdin.write("not json\n");
setTimeout(() => child.stdin.end(), 400);
const code = await new Promise((r) => child.on("close", r));
server.close();

const lines = out.trim().split("\n").map((l) => JSON.parse(l));
const byId = Object.fromEntries(lines.filter((l) => l.id !== null).map((l) => [l.id, l]));
assert.equal(code, 0, "exits cleanly when stdin closes");
assert.equal(byId[1].result.echo, "initialize");
assert.equal(byId[2].result.echo, "tools/list");
assert.equal(byId[3].error.code, -32000);
assert.match(byId[3].error.message, /Invalid API key/);
assert.ok(lines.some((l) => l.id === null && l.error.code === -32700), "parse error reported");
assert.equal(lines.length, 4, "notification produced no output");
assert.ok(seen.every((s) => s.auth === "Bearer tx_live_test"), "key sent as Bearer");
console.log("bridge OK:", lines.length, "responses,", seen.length, "HTTP calls");
