/* =========================================================
   /api/admin/:action
     POST  /api/admin/setup          one-time account creation
     GET   /api/admin/setup-status   has an account been created?
     POST  /api/admin/login          sets the session cookie
     POST  /api/admin/logout         clears it
     GET   /api/admin/session        is this browser signed in?

   One Vercel Function serves all five. Grouping them keeps the
   deployment well inside the function count of every Vercel
   plan and keeps cold starts rare, since all admin traffic
   lands on the same instance.

   No password, hash or secret is ever returned by any branch.
   ========================================================= */

import crypto from "node:crypto";
import {
  getAdminCredentials,
  getAdminRecord,
  createAdminRecord,
  verifyPassword,
  signSession,
  sessionCookie,
  requireAdmin
} from "../../lib/auth.js";
import { storageStatus, diagnose, StorageUnavailable } from "../../lib/store.js";
import { describeNumbering } from "../../lib/numbering.js";
import {
  ok,
  created,
  badRequest,
  unauthorized,
  notFound,
  methodNotAllowed,
  conflict,
  serverError,
  serviceUnavailable,
  readBody,
  collapse,
  isEmail,
  rateLimit
} from "../../lib/http.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || "");

  try {
    switch (action) {
      case "setup":
        return await setup(req, res);
      case "setup-status":
        return await setupStatus(req, res);
      case "login":
        return await login(req, res);
      case "logout":
        return await logout(req, res);
      case "session":
        return await session(req, res);
      default:
        return notFound(res, "Unknown administrator endpoint.");
    }
  } catch (error) {
    if (error instanceof StorageUnavailable) {
      /* The full reason goes to the Vercel function log, where only the
         deployment owner can read it. The response carries a short code
         and, when storage is simply not configured, the NAMES of the
         variables that were and were not visible — never a value. */
      console.error(
        "[security-training-academy] storage failure during admin/" + action +
        " · reason=" + error.reason + " · " + error.message
      );
      return serviceUnavailable(
        res,
        error,
        "The account service is temporarily unavailable.",
        { reason: error.reason, storage: storageStatus() }
      );
    }
    return serverError(res, error);
  }
}

/* ---------------------------------------------------------
   One-time setup

   Open only while no administrator exists. Once an account is
   written, every later call is refused. The write itself is
   conditional (SET ... NX), so two setup requests arriving at
   the same instant cannot both succeed.
   --------------------------------------------------------- */
async function setup(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  if (!rateLimit(req, "setup", 10, 60_000)) {
    return badRequest(res, "Too many attempts. Wait a minute and try again.");
  }

  const existing = await getAdminCredentials();
  if (existing) {
    return conflict(
      res,
      "An administrator account already exists. Use the sign-in page."
    );
  }

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  const email = collapse(body.email, 160).toLowerCase();
  const password = String(body.password ?? "");
  const confirm = String(body.confirmPassword ?? "");

  if (!isEmail(email)) return badRequest(res, "Enter a valid email address.");
  if (password.length < 12 || password.length > 128) {
    return badRequest(res, "Password must be between 12 and 128 characters.");
  }
  if (password !== confirm) return badRequest(res, "Passwords do not match.");
  if (password.toLowerCase().includes(email.split("@")[0].toLowerCase())) {
    return badRequest(res, "The password must not contain your email name.");
  }

  const record = await createAdminRecord(email, password);
  if (!record) {
    return conflict(
      res,
      "An administrator account already exists. Use the sign-in page."
    );
  }

  return created(res, {
    ok: true,
    message: "Administrator account created. You can sign in now."
  });
}

async function setupStatus(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const credentials = await getAdminCredentials();
  const stored = await getAdminRecord();
  return ok(res, {
    configured: Boolean(credentials),
    /* Distinguishes "provisioned from environment variables" from
       "created through this page", which is the difference between
       setup being closed and setup never having been opened. */
    source: credentials ? (stored ? "database" : "environment") : null,
    storage: storageStatus(),
    /* Variable NAMES only. Nothing here reveals a host, URL or token. */
    diagnostics: diagnose(),
    /* Lets you confirm from a browser which numbering scheme the running
       deployment is using, without signing in and without issuing
       anything. */
    numbering: describeNumbering()
  });
}

/* ---------------------------------------------------------
   Sign in
   --------------------------------------------------------- */
async function login(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  if (!rateLimit(req, "login", 8, 60_000)) {
    return badRequest(
      res,
      "Too many sign-in attempts. Wait a minute and try again."
    );
  }

  const credentials = await getAdminCredentials();
  if (!credentials) {
    return badRequest(
      res,
      "No administrator account exists yet. Open the one-time setup page first."
    );
  }

  const body = await readBody(req);
  if (!body) return badRequest(res, "Invalid request.");

  const email = collapse(body.email, 160).toLowerCase();
  const password = String(body.password ?? "");

  /* Both checks always run, and the failure message never says which
     one failed, so the endpoint cannot be used to discover whether an
     email address is the administrator's. */
  const emailOk =
    email.length === String(credentials.email).trim().toLowerCase().length &&
    crypto.timingSafeEqual(
      Buffer.from(email.padEnd(160, "\0")),
      Buffer.from(String(credentials.email).trim().toLowerCase().padEnd(160, "\0"))
    );
  const passwordOk = verifyPassword(password, credentials.passwordHash);

  if (!emailOk || !passwordOk) {
    await new Promise((r) => setTimeout(r, 400));
    return send401(res);
  }

  const token = await signSession(credentials.email);
  return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(token) });
}

function send401(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "Incorrect email or password." }));
}

async function logout(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(null) });
}

/* ---------------------------------------------------------
   Session check — used by every admin page before it renders
   --------------------------------------------------------- */
async function session(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const active = await requireAdmin(req);
  if (!active) return unauthorized(res);
  return ok(res, {
    authenticated: true,
    email: active.email,
    storage: storageStatus()
  });
}
