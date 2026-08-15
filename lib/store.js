/* =========================================================
   PERSISTENT STORAGE ADAPTER
   Server-only. Never imported by anything in /public.

   The reference project used Netlify Blobs. Vercel has no
   drop-in equivalent, so this module reproduces the three
   things the certificate system actually needed from it:

     1. durable JSON records that survive a redeploy
     2. an atomic counter for certificate numbering
     3. a listable index, newest first

   Driver A — "redis": Upstash Redis over its REST API.
     No npm dependency, so the function bundle stays small and
     cold starts stay fast.

     Vercel's Upstash integration does not always set the same
     variable names, so every form it is known to provide is
     accepted, in this order:

       1. KV_REST_API_URL      + KV_REST_API_TOKEN
       2. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
       3. derived from KV_URL / REDIS_URL / UPSTASH_REDIS_URL

     The third case matters. Those variables hold a connection
     string of the form

       rediss://default:TOKEN@host-12345.upstash.io:6379

     which carries the same credentials the REST API wants —
     the host becomes https://host, and the password is the
     REST token. Without this, a project given only those
     variables has working credentials sitting unused and the
     whole application reports itself unavailable.

   Driver B — "file": a JSON file under .data/.
     For `npm run dev` only. On Vercel this would live in /tmp,
     which is wiped between invocations, so the driver refuses
     to start in a deployment rather than losing certificates.
   ========================================================= */

import fs from "node:fs";
import path from "node:path";

const ON_VERCEL = Boolean(process.env.VERCEL);

/* Every variable name this application understands. Used for the
   diagnostic report, which lists which names were FOUND — never
   their values. */
const KNOWN_VARIABLES = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_URL",
  "REDIS_URL",
  "UPSTASH_REDIS_URL"
];

/* Turns rediss://default:TOKEN@host:6379 into the REST pair.
   Returns null for anything that is not a usable connection string. */
function fromConnectionString(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^rediss?:$/.test(url.protocol)) return null;
    const token = decodeURIComponent(url.password || "");
    if (!url.hostname || !token) return null;
    /* Upstash serves REST over https on the same hostname. */
    return { url: `https://${url.hostname}`, token };
  } catch {
    return null;
  }
}

function resolveConnection() {
  const env = process.env;

  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return {
      url: env.KV_REST_API_URL.replace(/\/+$/, ""),
      token: env.KV_REST_API_TOKEN,
      source: "KV_REST_API_URL + KV_REST_API_TOKEN"
    };
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""),
      token: env.UPSTASH_REDIS_REST_TOKEN,
      source: "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN"
    };
  }

  for (const name of ["KV_URL", "REDIS_URL", "UPSTASH_REDIS_URL"]) {
    const derived = fromConnectionString(env[name]);
    if (derived) {
      return { url: derived.url, token: derived.token, source: `${name} (derived)` };
    }
  }

  return null;
}

const CONNECTION = resolveConnection();

export const DRIVER = CONNECTION ? "redis" : "file";

/* Names only. This is safe to return over HTTP and safe to log:
   it never reveals a URL, a host, a token, or any part of one. */
export function diagnose() {
  return {
    onVercel: ON_VERCEL,
    driver: DRIVER,
    connectionSource: CONNECTION ? CONNECTION.source : null,
    variablesFound: KNOWN_VARIABLES.filter((n) => Boolean(process.env[n])),
    variablesMissing: KNOWN_VARIABLES.filter((n) => !process.env[n])
  };
}

/* Surfaced by the admin pages so an administrator is warned before
   they issue certificates into a store that will not keep them. */
export function storageStatus() {
  if (DRIVER === "redis") {
    return {
      driver: "redis",
      persistent: true,
      connectionSource: CONNECTION.source
    };
  }

  const found = diagnose().variablesFound;

  return {
    driver: "file",
    persistent: false,
    connectionSource: null,
    variablesFound: found,
    warning: ON_VERCEL
      ? (found.length
          ? `Redis variables are present (${found.join(", ")}) but none form a usable connection. ` +
            "Certificates cannot be stored."
          : "No Redis connection variables are visible to this deployment. " +
            "If the database is connected in Vercel, redeploy — environment " +
            "variables are read at deploy time. Certificates cannot be stored.")
      : "Local development store. Records live in .data/store.json and are not shared with any deployment."
  };
}

export class StorageUnavailable extends Error {
  /* `reason` is a short non-secret code so the calling endpoint can log
     something specific without ever putting connection details into a
     response. */
  constructor(message, reason) {
    super(message);
    this.name = "StorageUnavailable";
    this.reason = reason || "UNKNOWN";
  }
}

/* ---------------------------------------------------------
   Driver A — Upstash Redis REST
   --------------------------------------------------------- */
async function redis(command) {
  const verb = String(command[0] || "?").toUpperCase();
  let res;

  try {
    res = await fetch(CONNECTION.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONNECTION.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      cache: "no-store"
    });
  } catch (error) {
    /* The message is logged for the deployment owner, never returned.
       It names the command and the failure, not the endpoint. */
    throw new StorageUnavailable(
      `Redis endpoint unreachable during ${verb}: ${error.message}`,
      "UNREACHABLE"
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new StorageUnavailable(
      `Redis rejected the token during ${verb} (HTTP ${res.status}). ` +
      `Credentials came from ${CONNECTION.source}.`,
      "AUTH_REJECTED"
    );
  }

  if (!res.ok) {
    throw new StorageUnavailable(
      `Redis returned HTTP ${res.status} during ${verb}.`,
      "BACKEND_ERROR"
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new StorageUnavailable(
      `Redis returned a non-JSON response during ${verb}.`,
      "BACKEND_ERROR"
    );
  }

  if (data && data.error) {
    throw new StorageUnavailable(
      `Redis reported an error during ${verb}: ${data.error}`,
      "COMMAND_REJECTED"
    );
  }

  return data.result;
}

/* ---------------------------------------------------------
   Driver B — local JSON file (development)
   --------------------------------------------------------- */
const FILE_PATH = path.join(process.cwd(), ".data", "store.json");
let fileCache = null;

function fileRead() {
  if (ON_VERCEL) {
    const d = diagnose();
    throw new StorageUnavailable(
      "No usable Redis connection in this deployment. " +
      `Variables found: ${d.variablesFound.join(", ") || "none"}. ` +
      "If the database is connected in Vercel, redeploy — environment " +
      "variables are read at deploy time.",
      "NOT_CONFIGURED"
    );
  }
  if (fileCache) return fileCache;
  try {
    fileCache = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch {
    fileCache = { kv: {}, zset: {} };
  }
  return fileCache;
}

function fileWrite() {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(fileCache, null, 2));
}

/* ---------------------------------------------------------
   Public API — the only surface the rest of the app uses
   --------------------------------------------------------- */

export async function getJSON(key) {
  if (DRIVER === "redis") {
    const raw = await redis(["GET", key]);
    if (raw == null) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
  const db = fileRead();
  return Object.prototype.hasOwnProperty.call(db.kv, key) ? db.kv[key] : null;
}

export async function setJSON(key, value) {
  if (DRIVER === "redis") {
    await redis(["SET", key, JSON.stringify(value)]);
    return;
  }
  const db = fileRead();
  db.kv[key] = value;
  fileWrite();
}

/* Write only when the key does not already exist. Returns true when
   this call created it. Used so administrator setup cannot be run
   twice by two requests arriving together. */
export async function setJSONIfAbsent(key, value) {
  if (DRIVER === "redis") {
    const result = await redis(["SET", key, JSON.stringify(value), "NX"]);
    return result === "OK";
  }
  const db = fileRead();
  if (Object.prototype.hasOwnProperty.call(db.kv, key)) return false;
  db.kv[key] = value;
  fileWrite();
  return true;
}

export async function del(key) {
  if (DRIVER === "redis") {
    await redis(["DEL", key]);
    return;
  }
  const db = fileRead();
  delete db.kv[key];
  fileWrite();
}

/* Atomic increment. This is what guarantees two administrators
   pressing Generate at the same moment cannot receive the same
   certificate number. */
export async function incr(key) {
  if (DRIVER === "redis") {
    return Number(await redis(["INCR", key]));
  }
  const db = fileRead();
  const next = Number(db.kv[key] || 0) + 1;
  db.kv[key] = next;
  fileWrite();
  return next;
}

export async function indexAdd(indexKey, member, score) {
  if (DRIVER === "redis") {
    await redis(["ZADD", indexKey, String(score), member]);
    return;
  }
  const db = fileRead();
  db.zset[indexKey] = db.zset[indexKey] || {};
  db.zset[indexKey][member] = score;
  fileWrite();
}

export async function indexRemove(indexKey, member) {
  if (DRIVER === "redis") {
    await redis(["ZREM", indexKey, member]);
    return;
  }
  const db = fileRead();
  if (db.zset[indexKey]) delete db.zset[indexKey][member];
  fileWrite();
}

/* Newest first. */
export async function indexList(indexKey, limit = 100, offset = 0) {
  if (DRIVER === "redis") {
    const members = await redis([
      "ZRANGE",
      indexKey,
      String(offset),
      String(offset + limit - 1),
      "REV"
    ]);
    return Array.isArray(members) ? members : [];
  }
  const db = fileRead();
  const entries = Object.entries(db.zset[indexKey] || {});
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(offset, offset + limit).map((e) => e[0]);
}

export async function indexCount(indexKey) {
  if (DRIVER === "redis") {
    return Number(await redis(["ZCARD", indexKey])) || 0;
  }
  const db = fileRead();
  return Object.keys(db.zset[indexKey] || {}).length;
}

/* Fetch several records in one round trip. */
export async function getManyJSON(keys) {
  if (!keys.length) return [];
  if (DRIVER === "redis") {
    const raw = await redis(["MGET", ...keys]);
    return (raw || []).map((v) => {
      if (v == null) return null;
      try {
        return typeof v === "string" ? JSON.parse(v) : v;
      } catch {
        return null;
      }
    });
  }
  const db = fileRead();
  return keys.map((k) =>
    Object.prototype.hasOwnProperty.call(db.kv, k) ? db.kv[k] : null
  );
}

/* Test helper. Never routed, never reachable over HTTP. */
export function _resetFileCache() {
  fileCache = null;
}
