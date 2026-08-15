/* =========================================================
   npm test  —  end-to-end system test

   Starts the development server, then exercises the real API
   handlers over real HTTP: administrator setup, sign in,
   session handling, certificate issue, numbering, QR URL,
   public verification, revoke, restore, delete, the inquiry
   form, and — most importantly — that every administrator
   endpoint refuses an unauthenticated caller.

   It runs against a throwaway data directory, so it never
   touches a real store.
   ========================================================= */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const PORT = Number(process.env.TEST_PORT) || 3941;
const BASE = `http://127.0.0.1:${PORT}`;

const ADMIN_EMAIL = "administrator@example.test";
const ADMIN_PASSWORD = "correct-horse-battery-staple-2026";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log("  PASS  " + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? " — " + detail : ""));
    console.log("  FAIL  " + name + (detail ? " — " + detail : ""));
  }
}

function section(title) {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
}

let cookie = "";

async function call(pathname, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.withCookie !== false && cookie) headers.Cookie = cookie;

  const res = await fetch(BASE + pathname, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual"
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie && options.captureCookie) {
    cookie = setCookie.split(";")[0];
  }

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, setCookie, headers: res.headers };
}

async function waitForServer(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(BASE + "/api/admin/setup-status");
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sta-test-"));

  const server = spawn(
    process.execPath,
    [path.join(root, "scripts", "dev-server.mjs")],
    {
      cwd: dataDir,
      env: Object.assign({}, process.env, {
        PORT: String(PORT),
        VERCEL: "",
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD_HASH: "",
        SESSION_SECRET: ""
      }),
      stdio: ["ignore", "ignore", "inherit"]
    }
  );

  const stop = () => {
    try { server.kill(); } catch { /* already gone */ }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  process.on("exit", stop);

  if (!(await waitForServer())) {
    console.error("The development server did not start.");
    stop();
    process.exit(1);
  }

  console.log("Running against " + BASE + " with a temporary store.\n");

  /* =====================================================
     1. Static site
     ===================================================== */
  section("1. Static pages");
  for (const [label, route] of [
    ["Home page", "/"],
    ["Course catalogue", "/courses"],
    ["Course detail", "/course.html?id=security-management-fundamentals"],
    ["Verification page", "/verify"],
    ["Administrator sign in", "/admin"],
    ["Administrator setup", "/admin-setup.html"],
    ["Certificate generator", "/certificate-generator.html"],
    ["Second course detail", "/course.html?id=security-risk-management"],
    ["Stylesheet", "/assets/css/styles.css"],
    ["Certificate stylesheet", "/assets/css/certificate.css"],
    ["Course data", "/assets/js/courses.js"],
    ["Official logo", "/assets/img/logo.png"],
    ["Logo mark", "/assets/img/logo-mark.png"],
    ["QR library", "/assets/vendor/qrcode.min.js"]
  ]) {
    const res = await fetch(BASE + route);
    check(label + " loads", res.status === 200, "status " + res.status);
  }

  const notFound = await fetch(BASE + "/no-such-page");
  check("Unknown page returns 404", notFound.status === 404);

  /* =====================================================
     2. Unauthenticated access is refused
     ===================================================== */
  section("2. Administrator endpoints refuse anonymous callers");

  const guarded = [
    ["Certificate list", "/api/certificates/list", "GET", null],
    ["Certificate find", "/api/certificates/find?id=SEC-ACADEMY-2026-483027", "GET", null],
    ["Certificate create", "/api/certificates/create", "POST",
      { studentName: "Intruder", courseId: "security-management-fundamentals", completionDate: "2026-08-15" }],
    ["Certificate revoke", "/api/certificates/revoke", "POST",
      { id: "SEC-ACADEMY-2026-483027", status: "REVOKED" }],
    ["Certificate delete", "/api/certificates/delete", "POST",
      { id: "SEC-ACADEMY-2026-483027" }],
    ["Inquiry list", "/api/inquiry", "GET", null],
    ["Session check", "/api/admin/session", "GET", null]
  ];

  for (const [label, route, method, body] of guarded) {
    const res = await call(route, { method, body, withCookie: false });
    check(label + " refuses without a session", res.status === 401,
      "status " + res.status);
  }

  /* =====================================================
     3. Administrator setup
     ===================================================== */
  section("3. One-time administrator setup");

  let res = await call("/api/admin/setup-status", { withCookie: false });
  check("Setup reports as open", res.status === 200 && res.data.configured === false);
  check("Storage driver is reported", Boolean(res.data.storage && res.data.storage.driver));

  res = await call("/api/admin/setup", {
    method: "POST", withCookie: false,
    body: { email: "not-an-email", password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD }
  });
  check("Setup rejects an invalid email", res.status === 400);

  res = await call("/api/admin/setup", {
    method: "POST", withCookie: false,
    body: { email: ADMIN_EMAIL, password: "short", confirmPassword: "short" }
  });
  check("Setup rejects a short password", res.status === 400);

  res = await call("/api/admin/setup", {
    method: "POST", withCookie: false,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, confirmPassword: "different" }
  });
  check("Setup rejects mismatched passwords", res.status === 400);

  res = await call("/api/admin/setup", {
    method: "POST", withCookie: false,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD }
  });
  check("Setup creates the account", res.status === 201 && res.data.ok === true,
    JSON.stringify(res.data));

  res = await call("/api/admin/setup", {
    method: "POST", withCookie: false,
    body: { email: "second@example.test", password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD }
  });
  check("Setup closes after the first account", res.status === 409);

  res = await call("/api/admin/setup-status", { withCookie: false });
  check("Setup now reports as configured", res.data.configured === true);

  /* The stored account must not leak the hash or the secret. */
  const raw = JSON.stringify(res.data);
  check("Setup status leaks no password hash", !raw.includes("scrypt$"));
  check("Setup status leaks no session secret", !raw.includes("session_secret"));

  /* =====================================================
     4. Sign in
     ===================================================== */
  section("4. Authentication");

  res = await call("/api/admin/login", {
    method: "POST", withCookie: false,
    body: { email: ADMIN_EMAIL, password: "wrong-password-entirely" }
  });
  check("Wrong password is refused", res.status === 401);
  check("Refusal sets no cookie", !res.setCookie);

  res = await call("/api/admin/login", {
    method: "POST", withCookie: false,
    body: { email: "someone.else@example.test", password: ADMIN_PASSWORD }
  });
  check("Wrong email is refused", res.status === 401);
  check("Failure message does not say which field was wrong",
    typeof res.data.error === "string" &&
    !/email address is/i.test(res.data.error));

  res = await call("/api/admin/login", {
    method: "POST", withCookie: false, captureCookie: true,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  });
  check("Correct credentials sign in", res.status === 200 && res.data.ok === true);
  check("Session cookie is set", Boolean(res.setCookie));
  check("Session cookie is HttpOnly", /HttpOnly/i.test(res.setCookie || ""));
  check("Session cookie is SameSite=Strict", /SameSite=Strict/i.test(res.setCookie || ""));
  check("Session cookie carries no password", !/password/i.test(res.setCookie || ""));

  res = await call("/api/admin/session");
  check("Session check succeeds", res.status === 200 && res.data.authenticated === true);
  check("Session returns the administrator email", res.data.email === ADMIN_EMAIL);

  const forgedCookie = "sta_admin=eyJlbWFpbCI6ImF0dGFja2VyIn0.deadbeef";
  res = await call("/api/certificates/list", {
    withCookie: false, headers: { Cookie: forgedCookie }
  });
  check("A forged session cookie is refused", res.status === 401);

  /* =====================================================
     5. Certificate issue
     ===================================================== */
  section("5. Certificate generation");

  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "L", courseId: "security-management-fundamentals", completionDate: "2026-08-15" }
  });
  check("A one-character name is rejected", res.status === 400);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "Lawrence M. Fabul", courseId: "no-such-course", completionDate: "2026-08-15" }
  });
  check("An unknown course is rejected", res.status === 400);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "Robert<script>alert(1)</script>", courseId: "security-management-fundamentals", completionDate: "2026-08-15" }
  });
  check("Markup in a student name is rejected", res.status === 400);


  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "Lawrence M. Fabul", courseId: "loss-prevention-and-asset-protection", completionDate: "2026-08-15" }
  });
  check("A course that is not certificate-eligible is rejected", res.status === 400);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "Lawrence M. Fabul", courseId: "security-management-fundamentals", completionDate: "15/08/2026" }
  });
  check("A malformed date is rejected", res.status === 400);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: { studentName: "Lawrence M. Fabul", courseId: "security-management-fundamentals", completionDate: "2099-01-01" }
  });
  check("A far-future date is rejected", res.status === 400);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: {
      studentName: "Lawrence M. Fabul",
      courseId: "security-management-fundamentals",
      completionDate: "2026-08-15"
    }
  });
  check("A valid certificate is issued", res.status === 200 && res.data.ok === true,
    JSON.stringify(res.data));

  const first = res.data.certificate || {};
  check("Certificate number carries the completion year and random digits",
    /^SEC-ACADEMY-2026-\d{6}$/.test(first.certificate_id || ""),
    first.certificate_id);
  check("Course title comes from the catalogue, not the request",
    first.course_title === "Security Management Fundamentals", first.course_title);
  check("Student name is stored as typed", first.student_name === "Lawrence M. Fabul");
  check("Status is VALID", first.status === "VALID");
  check("Verification URL points at the verify page",
    (first.verification_url || "").endsWith("/verify?id=" + first.certificate_id),
    first.verification_url);

  /* A title supplied by the caller must be ignored entirely. */
  res = await call("/api/certificates/create", {
    method: "POST",
    body: {
      studentName: "Maria Santos",
      courseId: "security-risk-management",
      completionDate: "2026-08-15",
      course_title: "Doctor of Philosophy",
      courseTitle: "Doctor of Philosophy",
      certificate_id: "SEC-ACADEMY-2026-999999",
      status: "REVOKED"
    }
  });
  const second = res.data.certificate || {};
  check("A caller-supplied course title is ignored",
    second.course_title === "Security Risk Management", second.course_title);
  check("A caller-supplied certificate number is ignored",
    second.certificate_id !== "SEC-ACADEMY-2026-999999" &&
    /^SEC-ACADEMY-2026-\d{6}$/.test(second.certificate_id || ""),
    second.certificate_id);
  check("Certificate numbers are not sequential",
    second.certificate_id !== "SEC-ACADEMY-2026-000002", second.certificate_id);
  check("A caller-supplied status is ignored", second.status === "VALID");

  /* Sequence integrity under concurrency. */
  const NAMES = ["Alpha", "Bravo", "Charlie", "Delta",
                 "Echo", "Foxtrot", "Golf", "Hotel"];
  const batch = await Promise.all(
    NAMES.map((suffix) =>
      call("/api/certificates/create", {
        method: "POST",
        body: {
          studentName: "Concurrency Test " + suffix,
          courseId: "security-operations-and-supervision",
          completionDate: "2026-08-15"
        }
      })
    )
  );
  const batchIds = batch.map((r) => r.data?.certificate?.certificate_id).filter(Boolean);
  check("Eight simultaneous requests all succeeded", batchIds.length === 8,
    batchIds.length + " of 8");
  check("No duplicate certificate numbers were issued",
    new Set(batchIds).size === batchIds.length,
    batchIds.join(", "));

  /* The guarantee that matters most with random numbering: issue a large
     batch and prove every number is distinct and correctly formed. */
  const bulk = [];
  for (let i = 0; i < 60; i += 1) {
    bulk.push(call("/api/certificates/create", {
      method: "POST",
      body: {
        studentName: "Uniqueness Probe " + String.fromCharCode(65 + (i % 26)),
        courseId: "security-management-fundamentals",
        completionDate: "2026-08-15"
      }
    }));
  }
  const bulkIds = (await Promise.all(bulk))
    .map((r) => r.data?.certificate?.certificate_id)
    .filter(Boolean);
  check("60 rapid certificates were all issued", bulkIds.length === 60,
    bulkIds.length + " of 60");
  check("all 60 numbers are unique", new Set(bulkIds).size === bulkIds.length,
    bulkIds.length - new Set(bulkIds).size + " duplicates");
  check("all 60 numbers are correctly formed",
    bulkIds.every((id) => /^SEC-ACADEMY-2026-\d{6}$/.test(id)));
  check("numbers are not consecutive",
    new Set(bulkIds.map((id) => id.slice(-6))).size > 55);

  /* Clean up so later counts stay exact. */
  for (const id of bulkIds) {
    await call("/api/certificates/delete", { method: "POST", body: { id } });
  }

  /* Different year, different prefix. */
  res = await call("/api/certificates/create", {
    method: "POST",
    body: {
      studentName: "Prior Year Student",
      courseId: "security-management-fundamentals",
      completionDate: "2025-11-20"
    }
  });
  check("A 2025 completion is numbered under 2025",
    /^SEC-ACADEMY-2025-\d{6}$/.test(res.data?.certificate?.certificate_id || ""),
    res.data?.certificate?.certificate_id);
  const prevYearId = res.data?.certificate?.certificate_id;

  /* Punctuation that genuinely appears in Philippine names must pass.
     The record is removed afterwards so the counts below stay exact;
     the number it consumed is deliberately not reused. */
  res = await call("/api/certificates/create", {
    method: "POST",
    body: {
      studentName: "Jose Rizal-Santos, Jr.",
      courseId: "security-management-fundamentals",
      completionDate: "2026-08-15"
    }
  });
  check("A name with a hyphen, comma and full stop is accepted",
    res.status === 200, JSON.stringify(res.data));
  if (res.status === 200) {
    await call("/api/certificates/delete", {
      method: "POST", body: { id: res.data.certificate.certificate_id }
    });
  }

  /* =====================================================
     6. Listing and lookup
     ===================================================== */
  section("6. Certificate listing and lookup");

  res = await call("/api/certificates/list?limit=50");
  check("Listing succeeds", res.status === 200 && Array.isArray(res.data.certificates));
  check("Listing reports the right total", res.data.total === 11, "total " + res.data.total);
  check("Newest certificate is first",
    res.data.certificates[0]?.certificate_id === prevYearId,
    res.data.certificates[0]?.certificate_id);

  res = await call("/api/certificates/find?id=" + first.certificate_id.toLowerCase());
  check("Lookup is case-insensitive", res.status === 200 &&
    res.data.certificate?.student_name === "Lawrence M. Fabul");

  res = await call("/api/certificates/find?id=NONSENSE");
  check("Lookup rejects a malformed number", res.status === 400);

  res = await call("/api/certificates/find?id=SEC-ACADEMY-2026-111111");
  check("Lookup reports a missing number as not found", res.status === 404);

  /* =====================================================
     7. Public verification
     ===================================================== */
  section("7. Public verification (no session)");

  res = await call("/api/verify?id=" + first.certificate_id, { withCookie: false });
  check("A valid certificate verifies", res.status === 200 &&
    res.data.found === true && res.data.status === "VALID");
  check("Verification shows the recipient", res.data.student_name === "Lawrence M. Fabul");
  check("Verification shows the course",
    res.data.course_title === "Security Management Fundamentals");
  check("Verification shows the completion date",
    res.data.completion_date === "2026-08-15");
  check("Verification names the issuing organisation",
    res.data.issuing_organisation === "Philippine Security and Safety Professional");

  const exposed = Object.keys(res.data);
  const forbidden = ["issued_by", "created_at", "issue_date", "course_id", "verification_url"];
  for (const field of forbidden) {
    check("Verification does not expose " + field, !exposed.includes(field));
  }

  res = await call("/api/verify?id=SEC-ACADEMY-2026-222222", { withCookie: false });
  check("An unissued number reports NOT_FOUND",
    res.data.found === false && res.data.status === "NOT_FOUND");

  res = await call("/api/verify?id=DEFINITELY-NOT-AN-ID", { withCookie: false });
  check("A malformed number reports NOT_FOUND identically",
    res.data.found === false && res.data.status === "NOT_FOUND");

  res = await call("/api/verify", { withCookie: false });
  check("A missing number reports NOT_FOUND", res.data.found === false);

  res = await call("/api/verify?id=" + first.certificate_id, {
    method: "POST", withCookie: false, body: { id: "x" }
  });
  check("Verification refuses POST (it is read-only)", res.status === 405);

  /* =====================================================
     8. Revoke, restore, delete
     ===================================================== */
  section("8. Revoke, restore and delete");

  res = await call("/api/certificates/revoke", {
    method: "POST", body: { id: second.certificate_id, status: "REVOKED" }
  });
  check("Revoke succeeds", res.status === 200 && res.data.certificate.status === "REVOKED");

  res = await call("/api/verify?id=" + second.certificate_id, { withCookie: false });
  check("A revoked certificate verifies as REVOKED",
    res.data.found === true && res.data.status === "REVOKED");
  check("A revoked certificate hides the recipient name",
    !Object.keys(res.data).includes("student_name"));

  res = await call("/api/certificates/revoke", {
    method: "POST", body: { id: second.certificate_id, status: "VALID" }
  });
  check("Restore succeeds", res.status === 200 && res.data.certificate.status === "VALID");

  res = await call("/api/verify?id=" + second.certificate_id, { withCookie: false });
  check("A restored certificate verifies as VALID again", res.data.status === "VALID");

  res = await call("/api/certificates/revoke", {
    method: "POST", body: { id: second.certificate_id, status: "SOMETHING" }
  });
  check("An invalid status is rejected", res.status === 400);

  res = await call("/api/certificates/delete", {
    method: "POST", body: { id: prevYearId }
  });
  check("Delete succeeds", res.status === 200 && res.data.ok === true);

  res = await call("/api/verify?id=" + prevYearId, { withCookie: false });
  check("A deleted certificate reports NOT_FOUND", res.data.found === false);

  res = await call("/api/certificates/create", {
    method: "POST",
    body: {
      studentName: "Sequence Guard",
      courseId: "security-management-fundamentals",
      completionDate: "2025-12-01"
    }
  });
  check("A new 2025 certificate gets a fresh random number",
    /^SEC-ACADEMY-2025-\d{6}$/.test(res.data?.certificate?.certificate_id || "") &&
    res.data?.certificate?.certificate_id !== prevYearId,
    res.data?.certificate?.certificate_id);

  /* =====================================================
     9. Inquiry form
     ===================================================== */
  section("9. Enrolment inquiry");

  res = await call("/api/inquiry", {
    method: "POST", withCookie: false,
    body: { fullName: "A", email: "nope", mobile: "1", message: "" }
  });
  check("Invalid inquiry is rejected", res.status === 400);
  check("Invalid inquiry reports per-field errors",
    res.data.fields && res.data.fields.email && res.data.fields.fullName);

  res = await call("/api/inquiry", {
    method: "POST", withCookie: false,
    body: {
      fullName: "Ana Reyes", email: "ana@example.test", mobile: "0917 555 0100",
      courseId: "security-risk-management",
      message: "I would like to enrol next month."
    }
  });
  check("A valid inquiry is accepted", res.status === 201 && res.data.ok === true);
  check("A reference number is returned", /^INQ-\d{4}-\d{6}$/.test(res.data.reference || ""),
    res.data.reference);

  res = await call("/api/inquiry", {
    method: "POST", withCookie: false,
    body: {
      fullName: "Spam Bot", email: "bot@example.test", mobile: "09175550100",
      website: "http://spam.example", message: "buy things"
    }
  });
  check("The honeypot returns success without storing", res.status === 201);

  res = await call("/api/inquiry", {
    method: "POST", withCookie: false,
    body: {
      fullName: "Script Kiddie", email: "sk@example.test", mobile: "09175550100",
      message: '<script>alert(1)</script>'
    }
  });
  check("Markup in the message is rejected", res.status === 400);

  res = await call("/api/inquiry?limit=25");
  check("Administrator can list inquiries", res.status === 200);
  check("The honeypot submission was not stored", res.data.total === 1,
    "total " + res.data.total);
  check("Inquiry records the chosen course",
    res.data.inquiries[0]?.course_title === "Security Risk Management");

  /* =====================================================
     10. Sign out
     ===================================================== */
  section("10. Sign out");

  res = await call("/api/admin/logout", { method: "POST" });
  check("Logout succeeds", res.status === 200);
  check("Logout clears the cookie", /Max-Age=0/.test(res.setCookie || ""));

  cookie = "";
  res = await call("/api/certificates/list", { withCookie: false });
  check("Certificate list refuses again after sign out", res.status === 401);

  /* =====================================================
     11. Source hygiene
     ===================================================== */
  section("11. Source hygiene");

  const publicFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js|css|json|xml|txt)$/.test(entry.name)) publicFiles.push(full);
    }
  })(path.join(root, "public"));

  let oldBranding = [];
  let secretish = [];
  for (const file of publicFiles) {
    const text = fs.readFileSync(file, "utf8");
    if (/learn to earn|\bLTEA\b|ltea-|Learn-To-Earn/i.test(text)) {
      oldBranding.push(path.relative(root, file));
    }
    if (/scrypt\$|SESSION_SECRET|KV_REST_API_TOKEN|password_hash/.test(text)) {
      secretish.push(path.relative(root, file));
    }
  }
  check("No Learn To Earn branding in the public site",
    oldBranding.length === 0, oldBranding.join(", "));
  check("No secrets or hashes in the public site",
    secretish.length === 0, secretish.join(", "));

  let netlify = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      /* The scanner itself necessarily contains the strings it
         searches for, so it is excluded from its own scan. */
      if (entry.name === "node_modules" || entry.name === ".git" ||
          entry.name === ".data" || entry.name === "preview" ||
          entry.name === "test-system.mjs" ||
          entry.name === "final-qa.mjs") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js|mjs|css|json|toml)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        /* Comments explaining the migration are expected; a live
           dependency or a call to a Netlify path is not. */
        if (/\.netlify\/functions|@netlify\/|netlify\.toml|netlify dev/.test(text)) {
          netlify.push(path.relative(root, full));
        }
      }
    }
  })(root);
  check("No live Netlify dependencies remain", netlify.length === 0, netlify.join(", "));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  check("No runtime npm dependencies",
    Object.keys(pkg.dependencies || {}).length === 0);

  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  check("vercel.json is valid JSON and sets the output directory",
    vercelConfig.outputDirectory === "public");

  /* Course catalogue parity between the server and the browser. */
  const { COURSES } = await import(path.join(root, "lib", "courses.js"));
  const browserCourses = fs.readFileSync(
    path.join(root, "public", "assets", "js", "courses.js"), "utf8"
  );
  const parity = COURSES.every(
    (c) => browserCourses.includes('"' + c.courseId + '"') &&
           browserCourses.includes(JSON.stringify(c.courseTitle).slice(1, -1))
  );
  check("Browser course file matches lib/courses.js", parity,
    "run: npm run sync:courses");

  /* =====================================================
     Summary
     ===================================================== */
  console.log("\n" + "=".repeat(58));
  console.log("  " + passed + " passed, " + failed + " failed");
  console.log("=".repeat(58));
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log("");

  stop();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
