/* =========================================================
   ADMINISTRATOR AUTHENTICATION
   Server-only. Nothing in this file is ever sent to a browser.

   Passwords are hashed with scrypt and compared in constant
   time. A signed, HttpOnly cookie carries the session; the
   browser can read nothing from it and cannot forge one
   without the server-side secret.
   ========================================================= */

import crypto from "node:crypto";
import { getJSON, setJSONIfAbsent } from "./store.js";

export const SESSION_COOKIE = "sta_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
export const ADMIN_KEY = "admin:account";

/* ---------- Passwords ---------- */

export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return "scrypt$" + salt.toString("hex") + "$" + hash.toString("hex");
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const candidate = Buffer.from(hashPassword(password, parts[1]));
    const expected = Buffer.from(String(stored));
    return (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(candidate, expected)
    );
  } catch {
    return false;
  }
}

/* ---------- The administrator account ---------- */

export async function getAdminRecord() {
  try {
    return await getJSON(ADMIN_KEY);
  } catch {
    return null;
  }
}

export async function createAdminRecord(email, password) {
  const record = {
    email,
    password_hash: hashPassword(password),
    session_secret: crypto.randomBytes(32).toString("hex"),
    created_at: new Date().toISOString()
  };
  const created = await setJSONIfAbsent(ADMIN_KEY, record);
  return created ? record : null;
}

/* An account stored in the database wins. Environment variables stay
   supported so an account can be provisioned entirely from the Vercel
   dashboard without ever opening the setup page. */
export async function getAdminCredentials() {
  const record = await getAdminRecord();
  if (record?.email && record?.password_hash && record?.session_secret) {
    return {
      email: record.email,
      passwordHash: record.password_hash,
      sessionSecret: record.session_secret,
      source: "database"
    };
  }

  if (
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD_HASH &&
    process.env.SESSION_SECRET
  ) {
    return {
      email: process.env.ADMIN_EMAIL,
      passwordHash: process.env.ADMIN_PASSWORD_HASH,
      sessionSecret: process.env.SESSION_SECRET,
      source: "environment"
    };
  }

  return null;
}

export async function isAdminConfigured() {
  return Boolean(await getAdminCredentials());
}

/* ---------- Sessions ---------- */

export async function signSession(email) {
  const credentials = await getAdminCredentials();
  if (!credentials?.sessionSecret) {
    throw new Error("Administrator account is not configured");
  }
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", credentials.sessionSecret)
    .update(payload)
    .digest("base64url");
  return payload + "." + sig;
}

export async function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  try {
    const credentials = await getAdminCredentials();
    if (!credentials?.sessionSecret) return null;
    const expected = crypto
      .createHmac("sha256", credentials.sessionSecret)
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(sig || "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  /* Secure is omitted on plain-HTTP localhost, otherwise the browser
     silently drops the cookie during local development. Every Vercel
     deployment is HTTPS, so the flag is always set there. */
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production";
  const base =
    `${SESSION_COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Strict` +
    (secure ? "; Secure" : "");
  return token
    ? `${base}; Max-Age=${SESSION_TTL_SECONDS}`
    : `${base}; Max-Age=0`;
}

export function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  const match = String(header).match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  );
  return match ? match[1] : null;
}

/* The single security boundary used by every protected endpoint. */
export async function requireAdmin(req) {
  return await readSession(readCookie(req, SESSION_COOKIE));
}
