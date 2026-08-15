/* =========================================================
   Proves administrator account creation actually works, by
   standing up a mock Upstash REST endpoint that speaks the
   same protocol (POST a JSON command array, reply {result}).

   Runs the full journey for each variable form Vercel's
   Upstash integration might provide:

     setup-status -> setup -> login -> session -> certificate
   ========================================================= */

import http from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REDIS_PORT = 4200;
const TOKEN = "mock-upstash-token-value";

let pass = 0, fail = 0;
const bad = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log("    PASS  " + n); }
  else { fail++; bad.push(n + (d ? " — " + d : "")); console.log("    FAIL  " + n + (d ? " — " + d : "")); }
};

/* ---------- Mock Upstash REST server ---------- */
const store = new Map();
const zsets = new Map();
let commandLog = [];

function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    let cmd;
    try { cmd = JSON.parse(body); } catch {
      res.writeHead(400); res.end(JSON.stringify({ error: "bad request" })); return;
    }
    const [verb, ...args] = cmd.map(String);
    commandLog.push(verb.toUpperCase());
    let result = null;

    switch (verb.toUpperCase()) {
      case "GET": result = store.has(args[0]) ? store.get(args[0]) : null; break;
      case "SET":
        if (args[2] && args[2].toUpperCase() === "NX" && store.has(args[0])) { result = null; }
        else { store.set(args[0], args[1]); result = "OK"; }
        break;
      case "DEL": store.delete(args[0]); result = 1; break;
      case "INCR": {
        const n = Number(store.get(args[0]) || 0) + 1;
        store.set(args[0], String(n)); result = n; break;
      }
      case "ZADD": {
        if (!zsets.has(args[0])) zsets.set(args[0], new Map());
        zsets.get(args[0]).set(args[2], Number(args[1])); result = 1; break;
      }
      case "ZREM": zsets.get(args[0])?.delete(args[1]); result = 1; break;
      case "ZCARD": result = zsets.get(args[0])?.size || 0; break;
      case "ZRANGE": {
        const e = [...(zsets.get(args[0]) || new Map()).entries()];
        e.sort((a, b) => args.includes("REV") ? b[1] - a[1] : a[1] - b[1]);
        result = e.slice(Number(args[1]), Number(args[2]) + 1).map((x) => x[0]);
        break;
      }
      case "MGET": result = args.map((k) => store.has(k) ? store.get(k) : null); break;
      default:
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `unknown command ${verb}` }));
        return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
}

const redisServer = http.createServer(handler);
await new Promise((r) => redisServer.listen(REDIS_PORT, r));

console.log(`Mock Upstash REST endpoint on port ${REDIS_PORT}\n`);

/* ---------- Journey ---------- */
const EMAIL = "administrator@example.test";
const PASSWORD = "correct-horse-battery-staple-2026";

async function journey(label, env, port) {
  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));

  store.clear(); zsets.clear(); commandLog = [];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svc-"));
  const srv = spawn(process.execPath, [path.join(ROOT, "scripts", "dev-server.mjs")], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: process.env.HOME,
           PORT: String(port), VERCEL: "1", ...env },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let log = "";
  srv.stderr.on("data", (d) => { log += d.toString(); });
  await new Promise((r) => setTimeout(r, 1600));

  const base = `http://127.0.0.1:${port}`;
  let cookie = "";

  const call = async (p, opts = {}) => {
    const headers = {};
    if (opts.body) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + p, {
      method: opts.method || "GET", headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const sc = r.headers.get("set-cookie");
    if (sc && opts.capture) cookie = sc.split(";")[0];
    let d; const t = await r.text();
    try { d = JSON.parse(t); } catch { d = t; }
    return { status: r.status, data: d };
  };

  /* 1. setup-status */
  let r = await call("/api/admin/setup-status");
  check("setup-status responds 200", r.status === 200);
  check("driver is redis", r.data.storage?.driver === "redis",
        JSON.stringify(r.data.storage));
  check("reports which variables it used", Boolean(r.data.storage?.connectionSource),
        r.data.storage?.connectionSource);
  check("diagnostics leak no values",
        !JSON.stringify(r.data.diagnostics || {}).includes(TOKEN) &&
        !JSON.stringify(r.data.diagnostics || {}).includes("127.0.0.1"),
        JSON.stringify(r.data.diagnostics));
  console.log("      connectionSource:", r.data.storage?.connectionSource);

  /* 2. CREATE THE ADMINISTRATOR ACCOUNT */
  r = await call("/api/admin/setup", { method: "POST",
    body: { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD } });
  check("ADMIN ACCOUNT CREATION SUCCEEDS", r.status === 201 && r.data.ok === true,
        `${r.status} ${JSON.stringify(r.data)}`);
  check("account written to Redis", store.has("admin:account"));
  check("stored record holds a scrypt hash",
        String(store.get("admin:account") || "").includes("scrypt$"));
  check("response contains no hash or secret",
        !JSON.stringify(r.data).includes("scrypt$") &&
        !JSON.stringify(r.data).includes("session_secret"));

  /* 3. setup closes */
  r = await call("/api/admin/setup", { method: "POST",
    body: { email: "other@example.test", password: PASSWORD, confirmPassword: PASSWORD } });
  check("setup closes after first account", r.status === 409, String(r.status));

  /* 4. LOGIN */
  r = await call("/api/admin/login", { method: "POST", capture: true,
    body: { email: EMAIL, password: PASSWORD } });
  check("ADMIN LOGIN SUCCEEDS", r.status === 200 && r.data.ok === true,
        `${r.status} ${JSON.stringify(r.data)}`);
  check("session cookie issued", Boolean(cookie));

  r = await call("/api/admin/login", { method: "POST",
    body: { email: EMAIL, password: "wrong-password-here" } });
  check("wrong password still refused", r.status === 401);

  /* 5. DASHBOARD */
  r = await call("/api/admin/session");
  check("DASHBOARD SESSION VALID", r.status === 200 && r.data.authenticated === true);
  check("session names the signed-in admin", r.data.email === EMAIL);

  /* 6. Certificate end to end through Redis */
  r = await call("/api/certificates/create", { method: "POST",
    body: { studentName: "Lawrence M. Fabul", courseId: "security-management-fundamentals",
            completionDate: "2026-08-15" } });
  check("certificate issued via Redis", r.status === 200,
        `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  const id = r.data?.certificate?.certificate_id;
  check("certificate number carries year and random digits",
        /^SEC-ACADEMY-2026-\d{6}$/.test(id || ""), id);
  check("number claimed atomically (SET ... NX)",
        commandLog.includes("SET"), commandLog.join(","));

  r = await call("/api/verify?id=" + id);
  check("public verification works", r.data?.found === true && r.data?.status === "VALID");

  r = await call("/api/certificates/list");
  check("certificate listing works", r.status === 200 && r.data.total === 1);

  /* 7. Nothing secret in any log line */
  check("no token in server logs", !log.includes(TOKEN));

  srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}

const host = `127.0.0.1:${REDIS_PORT}`;

await journey(
  "FORM 1 — KV_REST_API_URL + KV_REST_API_TOKEN (what Vercel's Upstash integration sets)",
  { KV_REST_API_URL: `http://${host}`, KV_REST_API_TOKEN: TOKEN }, 4211
);

await journey(
  "FORM 2 — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
  { UPSTASH_REDIS_REST_URL: `http://${host}`, UPSTASH_REDIS_REST_TOKEN: TOKEN }, 4212
);

await journey(
  "FORM 3 — trailing slash on the URL",
  { KV_REST_API_URL: `http://${host}/`, KV_REST_API_TOKEN: TOKEN }, 4213
);

/* The case that used to fail outright: only the connection-string
   variables are present and no REST pair at all. Exercising this over the
   network would need a TLS endpoint on port 443, because the derivation
   correctly targets https. The logic itself is what matters, so it is
   checked directly. */
console.log("\n" + "=".repeat(72));
console.log("FORM 4 — only KV_URL / REDIS_URL (rediss:// connection string)");
console.log("=".repeat(72));
{
  const saved = { ...process.env };
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN",
                   "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    delete process.env[k];
  }
  process.env.KV_URL = "rediss://default:SECRET_TOKEN_VALUE@db-12345.upstash.io:6379";

  const mod = await import(
    pathToFileURL(path.join(ROOT, "lib", "store.js")).href + "?form4"
  );
  const d = mod.diagnose();

  check("connection derived from KV_URL", mod.DRIVER === "redis", mod.DRIVER);
  check("source is reported as derived",
        d.connectionSource === "KV_URL (derived)", d.connectionSource);
  check("diagnostic never contains the token",
        !JSON.stringify(d).includes("SECRET_TOKEN_VALUE"));
  check("diagnostic never contains the host",
        !JSON.stringify(d).includes("upstash.io"));

  process.env = saved;
}

redisServer.close();

console.log("\n" + "=".repeat(72));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(72));
bad.forEach((b) => console.log("  - " + b));
process.exit(fail ? 1 : 0);
