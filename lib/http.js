/* =========================================================
   HTTP HELPERS
   Small shims so every function behaves the same way and so
   nothing internal ever leaks into a response body.
   ========================================================= */

export function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export const ok = (res, body, headers) => send(res, 200, body, headers);
export const created = (res, body) => send(res, 201, body);
export const badRequest = (res, message) => send(res, 400, { error: message });
export const unauthorized = (res) =>
  send(res, 401, { error: "Unauthorised. Sign in as an administrator." });
export const notFound = (res, message) =>
  send(res, 404, { error: message || "Not found." });
export const methodNotAllowed = (res) =>
  send(res, 405, { error: "Method not allowed." });
export const conflict = (res, message) => send(res, 409, { error: message });

/* Public-facing wording only. The real reason is logged for the
   deployment owner and never returned to the caller. */
export function serverError(res, error, publicMessage) {
  console.error("[security-training-academy]", error);
  send(res, 500, {
    error: publicMessage || "Something went wrong. Please try again."
  });
}

export function serviceUnavailable(res, error, publicMessage, extra) {
  console.error("[security-training-academy]", error);
  send(res, 503, {
    error: publicMessage || "The service is temporarily unavailable.",
    ...(extra || {})
  });
}

/* Vercel parses JSON bodies for us, but a raw body still turns up
   when the content type is missing, so both cases are handled. */
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

export function str(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

export function collapse(value, max = 500) {
  return str(value, max).replace(/\s+/g, " ");
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 160;
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/* The public origin, used to build the URL encoded in the QR code.
   x-forwarded-host is what Vercel sets behind its edge network. */
export function originOf(req) {
  const envUrl = process.env.PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto =
    req.headers["x-forwarded-proto"] ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/* A deliberately small in-memory limiter for the public endpoints.
   Serverless instances are short-lived, so this is a speed bump
   against casual abuse rather than a guarantee. It is honest about
   being that, and it costs nothing. */
const buckets = new Map();

export function rateLimit(req, name, max, windowMs) {
  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) buckets.clear();
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
