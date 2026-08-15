/* =========================================================
   FINAL QA — walks the delivery checklist item by item.

   Anything that cannot be checked by executing something is
   reported as NOT VERIFIABLE HERE rather than passed.
   ========================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const P = (...p) => path.join(root, ...p);
const read = (...p) => fs.readFileSync(P(...p), "utf8");
const exists = (...p) => fs.existsSync(P(...p));

let pass = 0, fail = 0, note = 0;
const bad = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log("  [x] " + name); }
  else { fail += 1; bad.push(name + (detail ? " — " + detail : "")); console.log("  [!] " + name + (detail ? " — " + detail : "")); }
}
function unverified(name, why) {
  note += 1;
  console.log("  [~] " + name + " — NOT VERIFIED IN CURRENT ENVIRONMENT: " + why);
}
function head(t) { console.log("\n" + t + "\n" + "-".repeat(t.length)); }

/* ---------- gather ---------- */
const htmlFiles = fs.readdirSync(P("public")).filter((f) => f.endsWith(".html"));
const html = Object.fromEntries(htmlFiles.map((f) => [f, read("public", f)]));
const allHtml = Object.values(html).join("\n");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".data", "preview", ".vercel"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const allFiles = walk(root);
const codeFiles = allFiles.filter((f) => /\.(html|js|mjs|css|json)$/.test(f));

head("Pages and assets exist");
for (const f of ["index.html", "courses.html", "course.html", "verify.html",
                 "admin-login.html", "admin-setup.html", "admin.html",
                 "certificate-generator.html", "404.html",
                 "robots.txt", "sitemap.xml"]) {
  ok(f, exists("public", f));
}
for (const f of ["logo.png", "logo-mark.png", "favicon.png",
                 "favicon-512.png", "apple-touch-icon.png", "og-image.jpg"]) {
  ok("asset " + f, exists("public/assets/img", f));
}
ok("signatures/ folder ready for the real signature",
   exists("public/assets/img/signatures"));

head("No broken references");
const missing = [];
for (const [name, src] of Object.entries(html)) {
  for (const m of src.matchAll(/(?:href|src)="(\/[^"#?]+\.(?:css|js|png|jpg|woff2|ico))"/g)) {
    if (!exists("public", m[1])) missing.push(name + " -> " + m[1]);
  }
}
ok("Every stylesheet, script and image referenced by a page exists",
   missing.length === 0, missing.slice(0, 5).join(", "));

/* Every page sits at the site root, so asset paths must be relative.
   A rooted path resolves against the filesystem root when the site is
   opened from disk, which is what made the whole site render unstyled. */
const rootedAssets = [];
for (const [name, src] of Object.entries(html)) {
  if (/(?:href|src)="\/(?!\/)/.test(src)) rootedAssets.push(name);
}
ok("No rooted asset or page paths (they break file:// and nested routes)",
   rootedAssets.length === 0, rootedAssets.join(", "));

const rootedJs = fs.readdirSync(P("public/assets/js"))
  .filter((f) => /["'`]\/(?!api\/)[a-z0-9-]+\.html/i.test(read("public/assets/js", f)))
  .join(", ");
ok("No rooted page links inside client scripts", rootedJs === "", rootedJs);

head("Old branding removed");
const branded = allFiles
  .filter((f) => /\.(html|js|mjs|css|json|txt|xml|md)$/.test(f))
  .filter((f) => !/test-system\.mjs|final-qa\.mjs|README\.md/.test(f))
  .filter((f) => /learn to earn|\bLTEA\b|ltea[-_]|learn-to-earn/i.test(fs.readFileSync(f, "utf8")))
  .map((f) => path.relative(root, f));
ok("No Learn To Earn / LTE / LTEA anywhere in the project",
   branded.length === 0, branded.join(", "));
ok("Page titles carry the new identity",
   htmlFiles.every((f) => /Security Training Academy|Page not found/.test(html[f])));
ok("Open Graph metadata present on public pages",
   ["index.html", "courses.html", "verify.html", "course.html"]
     .every((f) => html[f].includes('property="og:title"')));
ok("Admin pages are noindex",
   ["admin.html", "admin-login.html", "admin-setup.html", "certificate-generator.html"]
     .every((f) => /name="robots"\s+content="noindex/.test(html[f])));
ok("robots.txt disallows admin and API",
   ["/admin", "/certificate-generator.html", "/api/"]
     .every((p) => read("public/robots.txt").includes("Disallow: " + p)));

head("No secrets in anything served to a browser");
const publicCode = allFiles.filter((f) => f.includes(path.join("public", "")) &&
  /\.(html|js|css|json)$/.test(f));
const leaked = publicCode.filter((f) => {
  const t = fs.readFileSync(f, "utf8");
  return /scrypt\$|SESSION_SECRET|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|password_hash|ADMIN_PASSWORD/.test(t);
}).map((f) => path.relative(root, f));
ok("No hashes, tokens or secrets under public/", leaked.length === 0, leaked.join(", "));
ok("lib/ sits outside public/ and is never served", !exists("public/lib"));
ok(".env is git-ignored", /(^|\n)\.env/.test(read(".gitignore")));
ok("No real secrets committed", !exists(".env") && !exists(".env.local"));
ok(".env.example documents variables without values",
   read(".env.example").includes("KV_REST_API_URL=") &&
   !/KV_REST_API_URL=\S/.test(read(".env.example")));

head("Netlify fully migrated");
ok("No netlify.toml", !exists("netlify.toml"));
ok("No netlify/ directory", !exists("netlify"));
const netRefs = codeFiles
  .filter((f) => !/test-system\.mjs|final-qa\.mjs/.test(f))
  .filter((f) => /\.netlify\/functions|@netlify\/|require\(["']@netlify/.test(fs.readFileSync(f, "utf8")))
  .map((f) => path.relative(root, f));
ok("No calls to Netlify function paths or packages",
   netRefs.length === 0, netRefs.join(", "));
const pkg = JSON.parse(read("package.json"));
ok("No @netlify dependency", !JSON.stringify(pkg.dependencies || {}).includes("netlify"));
ok("No runtime npm dependencies at all",
   Object.keys(pkg.dependencies || {}).length === 0);

head("Vercel configuration");
const vc = JSON.parse(read("vercel.json"));
ok("vercel.json is valid JSON", true);
ok("outputDirectory is public", vc.outputDirectory === "public");
ok("cleanUrls enabled", vc.cleanUrls === true);
/* The opposite of what this file used to assert. A Node.js function must
   NOT declare functions.runtime — that key is for community runtimes in
   package@semver form, and "nodejs22.x" fails the deploy outright.
   Vercel infers nodejs22.x from package.json engines.node. */
ok("No functions.runtime declaration (it is only for community runtimes)",
   Object.values(vc.functions || {}).every((f) => f.runtime === undefined));
ok("Node version declared once, in package.json engines",
   /^\d+\.x$/.test(pkg.engines?.node || ""), String(pkg.engines?.node));
ok("No legacy now.json", !exists("now.json"));
ok("/admin rewrite present",
   vc.rewrites.some((r) => r.source === "/admin"));
ok("No nested rewrite that would break relative asset paths",
   !vc.rewrites.some((r) => /\/:.+\//.test(r.source) || r.source.split("/").length > 2));
ok("An explicit build command is set", typeof vc.buildCommand === "string" &&
   vc.buildCommand.length > 0, String(vc.buildCommand));
for (const h of ["Content-Security-Policy", "X-Frame-Options",
                 "X-Content-Type-Options", "Strict-Transport-Security"]) {
  ok("Header " + h, JSON.stringify(vc.headers).includes(h));
}
ok("Admin pages set no-store",
   vc.headers.some((h) => /admin-login/.test(h.source) &&
     h.headers.some((x) => x.key === "Cache-Control" && x.value === "no-store")));
ok("API responses set no-store",
   vc.headers.some((h) => h.source === "/api/(.*)"));

const apiFiles = walk(P("api")).filter((f) => f.endsWith(".js"));
ok("Exactly four Vercel Functions (well under every plan limit)",
   apiFiles.length === 4, apiFiles.length + ": " +
   apiFiles.map((f) => path.relative(root, f)).join(", "));
for (const f of apiFiles) {
  ok(path.relative(root, f) + " exports a default handler",
     /export default (async )?function/.test(fs.readFileSync(f, "utf8")));
}

head("Authorisation is server-side");
const certApi = read("api/certificates/[action].js");
const firstCheck = certApi.indexOf("requireAdmin");
const firstBranch = certApi.indexOf("switch (action)");
ok("Certificate API checks the session before dispatching any action",
   firstCheck !== -1 && firstCheck < firstBranch);
ok("Inquiry GET requires an admin session",
   read("api/inquiry.js").includes("requireAdmin"));
const verifyApi = read("api/verify.js");
ok("Public verification imports no auth module", !verifyApi.includes("auth.js"));
ok("Public verification is read-only (no writes)",
   !/setJSON|indexAdd|del\(|incr\(/.test(verifyApi));
ok("Public verification refuses non-GET",
   verifyApi.includes('req.method !== "GET"'));
for (const field of ["issued_by", "created_at", "issue_date", "course_id"]) {
  const shown = new RegExp(field + "\\s*:", "").test(
    verifyApi.slice(verifyApi.indexOf("status: \"VALID\""))
  );
  ok("Verification response omits " + field, !shown);
}
ok("Session cookie is HttpOnly and SameSite=Strict",
   /HttpOnly; SameSite=Strict/.test(read("lib/auth.js")));
ok("Passwords hashed with scrypt", read("lib/auth.js").includes("scryptSync"));
ok("Password comparison is constant time",
   read("lib/auth.js").includes("timingSafeEqual"));

head("Certificate system");
const numbering = read("lib/numbering.js");
ok("Certificate ID is the completion year plus random digits",
   numbering.includes("crypto.randomInt") &&
   numbering.includes("${PREFIX}-${year}-${suffix}"));
/* Strip comments before checking, otherwise the note explaining why
   Math.random is unsuitable trips the very check that forbids it. */
const numberingCode = numbering
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
ok("Randomness is cryptographic, not Math.random",
   numberingCode.includes("crypto.randomInt") &&
   !numberingCode.includes("Math.random"));
ok("Old sequential numbers still verify",
   /\\d\{4,8\}/.test(numbering));
ok("Numbers are claimed atomically, so a collision cannot duplicate one",
   certApi.includes("setJSONIfAbsent(certKey(candidate)"));
ok("A number already taken is redrawn, never overwritten",
   certApi.includes("MAX_ATTEMPTS") &&
   certApi.includes("could not be allocated"));

ok("Course title is taken from the catalogue, not the request",
   certApi.includes("course.courseTitle") &&
   !/body\.courseTitle|body\.course_title/.test(certApi));
ok("Only ACTIVE + certificateEligible courses accepted",
   certApi.includes("isCertifiable(courseId)"));
ok("QR encodes the public verification route",
   certApi.includes("/verify?id="));

const certCss = read("public/assets/css/certificate.css");
ok("Certificate is 297mm x 210mm (A4 landscape)",
   certCss.includes("width: 297mm") && certCss.includes("height: 210mm"));
ok("QR box is square", certCss.includes("width: 29mm") && certCss.includes("height: 29mm"));
ok("QR box has a quiet zone", /\.certificate__qr-box[\s\S]*?padding: 1\.5mm/.test(certCss));
const printCss = read("public/assets/css/print.css");
ok("Print page is A4 landscape with zero margin",
   printCss.includes("size: A4 landscape") && printCss.includes("margin: 0"));
ok("Print forces background graphics", printCss.includes("print-color-adjust: exact"));
ok("Print undoes the screen scaling", printCss.includes("transform: none"));
ok("Revoked reprints are stamped", certCss.includes(".certificate.is-revoked::after"));

head("Signature");
const sig = read("public/assets/js/signature-config.js");
const sigBody = sig.slice(sig.indexOf("window.STA_SIGNATURE"));
const sigConfigured = /image:\s*"([^"]+)"/.exec(sigBody);
ok("Signature is either a supplied image file or the placeholder — never drawn",
   sigConfigured
     ? exists("public", sigConfigured[1])
     : /image:\s*null/.test(sigBody),
   sigConfigured ? "configured: " + sigConfigured[1] : "placeholder");
ok("Signatory name exact", sig.includes("Mr. Darryl C. Bautista"));
ok("Credentials exact", sig.includes("CSP, CST, SO4, SM"));
ok("A placeholder is defined for when no signature is supplied",
   sig.includes("[ Authorized Signature ]"));
ok("No invented titles or affiliations",
   !/President|Director|Chairman|Ph\.?D|Founder|CEO/i.test(sig));
ok("Renderer falls back to the placeholder if an image is missing",
   read("public/assets/js/certificate-render.js").includes("image.onerror"));
/* If a signature image is present it must be the one the config points at
   — never a stray file that nothing references. */
const sigFiles = fs.readdirSync(P("public/assets/img/signatures"))
  .filter((f) => /\.(png|jpe?g|svg|webp|gif)$/i.test(f));
ok("Any signature image present is the configured one",
   sigFiles.length === 0 ||
   (sigConfigured && sigFiles.length === 1 &&
    sigConfigured[1].endsWith(sigFiles[0])),
   sigFiles.join(", "));

head("Logo");
ok("Official logo present and optimised",
   fs.statSync(P("public/assets/img/logo.png")).size < 120000);
ok("Logo used in the header", html["index.html"].includes('src="assets/img/logo.png"'));
ok("Logo used on the certificate",
   html["certificate-generator.html"].includes('certificate__logo'));
ok("Logo used on the verification page", html["verify.html"].includes('src="assets/img/logo.png"'));
ok("Shield mark used as the certificate watermark",
   html["certificate-generator.html"].includes("certificate__watermark"));
ok("Favicon derived from the official mark", exists("public/assets/img/favicon.png"));
ok("No AI-generated replacement logo committed",
   !allFiles.some((f) => /logo.*(generated|ai|fake|placeholder)/i.test(f)));

head("Courses");
const browserCourses = read("public/assets/js/courses.js");
ok("Generated course file carries a do-not-edit banner",
   browserCourses.includes("GENERATED FILE. DO NOT EDIT"));
ok("Course data uses the documented field names",
   ["courseId", "courseTitle", "category", "duration", "level", "price",
    "modules", "learningObjectives", "requirements", "certificateEligible",
    "status", "image"].every((f) => browserCourses.includes('"' + f + '"')));
ok("All three statuses are supported",
   read("lib/courses.js").includes("COMING_SOON") &&
   read("lib/courses.js").includes("INACTIVE"));

head("Accessibility and SEO basics");
ok("Every page declares a viewport",
   htmlFiles.every((f) => html[f].includes('name="viewport"')));
ok("Every page declares a language", htmlFiles.every((f) => html[f].includes('<html lang="en"')));
ok("Public pages have meta descriptions",
   ["index.html", "courses.html", "verify.html", "course.html"]
     .every((f) => html[f].includes('name="description"')));
ok("Skip links on public pages",
   ["index.html", "courses.html", "verify.html", "course.html"]
     .every((f) => html[f].includes("skip-link")));
const noAlt = [];
for (const [name, src] of Object.entries(html)) {
  for (const m of src.matchAll(/<img (?![^>]*\balt=)[^>]*>/g)) noAlt.push(name);
}
ok("Every image has an alt attribute", noAlt.length === 0, [...new Set(noAlt)].join(", "));
ok("Forms use labels",
   (html["index.html"].match(/<label/g) || []).length >= 5);
ok("Reduced motion respected",
   read("public/assets/css/styles.css").includes("prefers-reduced-motion"));

head("Unsupported claims");
const claimy = [];
for (const [name, src] of Object.entries(html)) {
  const text = src.replace(/<[^>]+>/g, " ");
  if (/\baccredited\b|\bgovernment[- ]recognis|licensed by|PNP[- ]approved|DOLE[- ]accredit|TESDA/i.test(text)) {
    claimy.push(name);
  }
}
ok("No accreditation, licensing or government-recognition claims",
   claimy.length === 0, claimy.join(", "));
ok("Certificate limits stated on the public site",
   ["index.html", "courses.html", "course.html"]
     .every((f) => /not a government licence/i.test(html[f])));

head("Renders from disk as well as over HTTP");
ok("A build step exists that validates asset paths", exists("scripts/build.mjs"));
ok("package.json exposes build, dev and preview",
   ["build", "dev", "preview"].every((k) => pkg.scripts[k]));
ok("No CORS-dependent font preloads (they fail over file://)",
   !/rel="preload"[^>]*as="font"/.test(allHtml));
const unresolved = [];
for (const [name, src] of Object.entries(html)) {
  for (const m of src.matchAll(/(?:href|src)="([^":]+\.(?:css|js|png|jpe?g|woff2|ico))"/g)) {
    if (!exists("public", m[1].split(/[?#]/)[0])) unresolved.push(name + " -> " + m[1]);
  }
}
ok("Every referenced asset resolves relative to the page",
   unresolved.length === 0, unresolved.slice(0, 4).join(", "));

head("Housekeeping");
ok("No duplicate or stray build folders",
   !exists("public/assets/{css,js,img,fonts,vendor}"));
ok("Preview output excluded from the deployed site", !exists("public/certificate-preview.html"));
ok("README present", exists("README.md") && read("README.md").length > 4000);
ok("README states what was not verified",
   /NOT VERIFIED|not verified/i.test(read("README.md")));

head("Cannot be checked from here");
unverified("Vercel deployment succeeds", "no deployment is performed from this environment");
unverified("Upstash Redis persistence across redeploys", "no Redis instance is reachable here");
unverified("Scanning a physically printed sheet with a phone camera",
  "the QR was decoded from a rasterised PDF, not paper");
unverified("Deliverability of inquiry follow-up email",
  "the system stores inquiries; it does not send mail");

console.log("\n" + "=".repeat(60));
console.log(`  ${pass} checks passed, ${fail} failed, ${note} not verifiable here`);
console.log("=".repeat(60));
if (bad.length) {
  console.log("\nFailures:");
  bad.forEach((b) => console.log("  - " + b));
}
console.log("");
process.exit(fail ? 1 : 0);
