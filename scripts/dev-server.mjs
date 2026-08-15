/* =========================================================
   npm run dev  —  local development server

   Serves public/ as static files and routes /api/* to the
   same handler files Vercel will run, with the same request
   and response shape:

     req.query, req.body (parsed JSON), req.headers.cookie
     res.statusCode, res.setHeader, res.end

   It also reproduces Vercel's cleanUrls behaviour and the
   dynamic [action] segment, so a route that works here works
   in the deployment.

   This file is for development only. Vercel never runs it —
   it builds no server, it just serves public/ and turns each
   file under api/ into a function.
   ========================================================= */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const publicDir = path.join(root, "public");
const apiDir = path.join(root, "api");

const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

/* ---------- Resolve /api/... to a handler file ---------- */
function resolveApi(pathname) {
  const segments = pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  if (!segments.length) return null;

  /* Exact file:  /api/verify -> api/verify.js */
  const exact = path.join(apiDir, ...segments) + ".js";
  if (fs.existsSync(exact)) return { file: exact, params: {} };

  /* Dynamic segment:  /api/admin/login -> api/admin/[action].js */
  if (segments.length >= 2) {
    const dir = path.join(apiDir, ...segments.slice(0, -1));
    if (fs.existsSync(dir)) {
      const dynamic = fs
        .readdirSync(dir)
        .find((name) => /^\[.+\]\.js$/.test(name));
      if (dynamic) {
        const key = dynamic.slice(1, dynamic.indexOf("]"));
        return {
          file: path.join(dir, dynamic),
          params: { [key]: segments[segments.length - 1] }
        };
      }
    }
  }

  return null;
}

/* ---------- Static file, with cleanUrls ---------- */
function resolveStatic(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/index.html";
  const candidates = [
    path.join(publicDir, clean),
    path.join(publicDir, clean + ".html"),
    path.join(publicDir, clean, "index.html")
  ];

  /* vercel.json rewrites */
  if (clean === "/admin") candidates.unshift(path.join(publicDir, "admin-login.html"));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    /* Never serve anything outside public/. */
    if (!resolved.startsWith(path.resolve(publicDir))) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  /* ---------- API ---------- */
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const route = resolveApi(pathname);
    if (!route) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Not found." }));
      return;
    }

    /* Vercel merges the path parameters into req.query. */
    const query = { ...route.params };
    url.searchParams.forEach((value, key) => {
      if (!(key in query)) query[key] = value;
    });
    req.query = query;
    req.body = await readJsonBody(req);

    try {
      /* Cache-busted import so an edit is picked up on the next
         request without restarting the server. */
      const module = await import(
        pathToFileURL(route.file).href + "?t=" + Date.now()
      );
      await module.default(req, res);
    } catch (error) {
      console.error("Handler error:", error);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Something went wrong." }));
      }
    }
    return;
  }

  /* ---------- Static ---------- */
  const file = resolveStatic(pathname);
  if (!file) {
    const notFound = path.join(publicDir, "404.html");
    res.statusCode = 404;
    if (fs.existsSync(notFound)) {
      res.setHeader("Content-Type", MIME[".html"]);
      res.end(fs.readFileSync(notFound));
    } else {
      res.end("Not found");
    }
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`
Security Training Academy — development server

  Website          http://localhost:${PORT}/
  Courses          http://localhost:${PORT}/courses
  Verification     http://localhost:${PORT}/verify
  Administrator    http://localhost:${PORT}/admin

  Records are stored in .data/store.json unless Redis
  connection variables are set. That file is for development
  only and is git-ignored.
`);
});
