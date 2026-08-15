/* =========================================================
   npm run build

   This project is static HTML, CSS and JavaScript with four
   serverless functions. There is nothing to bundle, transpile
   or minify, and there are no runtime dependencies — so the
   build step does the two things that genuinely need doing
   before a deploy:

     1. regenerates public/assets/js/courses.js from
        lib/courses.js, so the browser and the server can never
        disagree about which courses exist
     2. verifies that every stylesheet, script, image and font
        referenced by a page actually exists, and that no page
        uses a path that would break

   It fails loudly rather than shipping a site that renders as
   unstyled HTML.

   Vercel runs this via "buildCommand" in vercel.json.
   ========================================================= */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const publicDir = path.join(root, "public");

let problems = 0;
const fail = (message) => {
  console.error("  ERROR  " + message);
  problems += 1;
};

console.log("\nSecurity Training Academy — build\n");

/* ---------------------------------------------------------
   1. Course data
   --------------------------------------------------------- */
console.log("1. Regenerating the browser course catalogue");
const sync = spawnSync(
  process.execPath,
  [path.join(here, "sync-courses.mjs")],
  { encoding: "utf8" }
);
process.stdout.write("   " + (sync.stdout || "").trim() + "\n");
if (sync.status !== 0) {
  console.error(sync.stderr);
  fail("the course catalogue could not be generated");
}

/* ---------------------------------------------------------
   2. Asset references
   --------------------------------------------------------- */
console.log("\n2. Checking every asset reference on every page");

const pages = fs.readdirSync(publicDir).filter((f) => f.endsWith(".html"));
let checked = 0;

for (const page of pages) {
  const src = fs.readFileSync(path.join(publicDir, page), "utf8");

  /* Every page in this project sits at the site root, so an asset
     reference must be a plain relative path. A leading slash breaks the
     page when it is opened straight from disk, because the browser
     resolves it against the filesystem root instead of the project
     folder. A ../ would escape the published directory entirely. */
  for (const m of src.matchAll(/(?:href|src)="([^"]+\.(?:css|js|png|jpe?g|svg|woff2|ico))"/g)) {
    const ref = m[1];
    checked += 1;

    if (/^https?:\/\//.test(ref) || ref.startsWith("data:")) continue;

    if (ref.startsWith("/")) {
      fail(`${page}: "${ref}" starts with a slash. Use "${ref.slice(1)}" instead — ` +
           "a rooted path cannot resolve when the page is opened from disk.");
      continue;
    }
    if (ref.startsWith("../")) {
      fail(`${page}: "${ref}" points outside public/.`);
      continue;
    }
    if (!fs.existsSync(path.join(publicDir, ref.split(/[?#]/)[0]))) {
      fail(`${page}: "${ref}" does not exist.`);
    }
  }

  /* Same rule for links between pages. */
  for (const m of src.matchAll(/href="([^"]+\.html[^"]*)"/g)) {
    const ref = m[1];
    if (/^https?:\/\//.test(ref)) continue;
    if (ref.startsWith("/")) {
      fail(`${page}: link "${ref}" starts with a slash.`);
      continue;
    }
    const target = ref.split(/[?#]/)[0];
    if (!fs.existsSync(path.join(publicDir, target))) {
      fail(`${page}: link "${ref}" points at a page that does not exist.`);
    }
  }
}
console.log(`   ${checked} references across ${pages.length} pages`);

/* ---------------------------------------------------------
   3. Client-side scripts
   --------------------------------------------------------- */
console.log("\n3. Checking links built in JavaScript");

const jsDir = path.join(publicDir, "assets", "js");
for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(jsDir, file), "utf8");

  /* API calls are meant to be rooted — they always address the
     deployment, never a file next to the page. Page links are not. */
  for (const m of src.matchAll(/["'`]\/(?!api\/)([a-z0-9-]+\.html)/gi)) {
    fail(`assets/js/${file}: "/${m[1]}" should be "${m[1]}" so it also ` +
         "resolves when the site is opened from disk.");
  }
}
console.log("   done");

/* ---------------------------------------------------------
   4. Functions
   --------------------------------------------------------- */
console.log("\n4. Checking the serverless functions");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".js")) out.push(full);
  }
  return out;
}
const functions = walk(path.join(root, "api"));
for (const f of functions) {
  if (!/export default (async )?function/.test(fs.readFileSync(f, "utf8"))) {
    fail(path.relative(root, f) + " has no default export.");
  }
}
console.log(`   ${functions.length} functions`);

/* ---------------------------------------------------------
   4b. Authorised signature
   --------------------------------------------------------- */
console.log("\n4b. Checking the signature configuration");

const sigSource = fs.readFileSync(
  path.join(publicDir, "assets", "js", "signature-config.js"), "utf8"
);
/* Read only from the assignment onwards. The file's header comment contains
   a worked example, and matching that instead of the live setting would let
   a genuinely broken path through. */
const sigBody = sigSource.slice(sigSource.indexOf("window.STA_SIGNATURE"));
const sigMatch = sigBody.match(/^\s*image:\s*(null|"([^"]*)")/m);

if (!sigMatch) {
  fail("signature-config.js has no `image:` setting.");
} else if (sigMatch[1] === "null") {
  console.log("   no signature image configured — the certificate prints the placeholder");
} else {
  const ref = sigMatch[2];
  if (ref.startsWith("/")) {
    fail(`signature image "${ref}" starts with a slash. Use "${ref.slice(1)}".`);
  } else if (!fs.existsSync(path.join(publicDir, ref))) {
    fail(`signature image "${ref}" is configured but the file does not exist ` +
         `at public/${ref}. The certificate would fall back to the placeholder.`);
  } else {
    console.log(`   signature image found: ${ref}`);
  }
}

/* ---------------------------------------------------------
   5. Vercel configuration
   --------------------------------------------------------- */
console.log("\n5. Checking vercel.json");

const vercelPath = path.join(root, "vercel.json");
let vercel = null;
try {
  vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
} catch (error) {
  fail("vercel.json is not valid JSON: " + error.message);
}

if (fs.existsSync(path.join(root, "now.json"))) {
  fail("now.json is legacy configuration and conflicts with vercel.json. Delete it.");
}

if (vercel) {
  for (const [pattern, config] of Object.entries(vercel.functions || {})) {
    /* This is the exact rule Vercel applies. `functions.runtime` names a
       COMMUNITY runtime and must be "package@semver", e.g.
       "vercel-php@0.6.0". Vercel validates it with
       semver.valid(value.split("@").pop()).

       A Node.js function must not declare it at all: Vercel detects Node
       from the .js file and takes the version from engines.node below.
       Writing "nodejs22.x" here fails the deploy with

         Function Runtimes must have a valid version, for example
         `now-php@1.0.0`.

       which is confusing, because the value looks like the one Vercel
       reports back in its own build output. */
    if (config.runtime !== undefined) {
      const tag = String(config.runtime).split("@").pop();
      const semver = /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(tag);
      if (!semver) {
        fail(
          `vercel.json functions["${pattern}"].runtime is "${config.runtime}". ` +
          "That key is only for community runtimes written as package@1.2.3. " +
          "For Node.js functions remove it entirely and set the version in " +
          "package.json engines.node."
        );
      }
    }
    if (config.memory !== undefined && (config.memory < 128 || config.memory > 10240)) {
      fail(`vercel.json functions["${pattern}"].memory must be between 128 and 10240.`);
    }
    if (config.maxDuration !== undefined &&
        (!Number.isInteger(config.maxDuration) || config.maxDuration < 1)) {
      fail(`vercel.json functions["${pattern}"].maxDuration must be a positive integer.`);
    }
    if (pattern.startsWith("/")) {
      fail(`vercel.json functions key "${pattern}" must not start with a slash.`);
    }
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nodeRange = pkg.engines?.node;
if (!nodeRange) {
  fail("package.json has no engines.node. Vercel needs it to pick the Node version.");
} else if (!/^\d+\.x$/.test(nodeRange)) {
  console.log(`   note: engines.node is "${nodeRange}". Vercel prefers the form "22.x".`);
}
console.log(`   node ${nodeRange} · ${Object.keys(vercel?.functions || {}).length} function rule(s)`);

/* ---------------------------------------------------------
   Result
   --------------------------------------------------------- */
console.log("");
if (problems) {
  console.error(`Build failed: ${problems} problem${problems === 1 ? "" : "s"}.\n`);
  process.exit(1);
}
console.log("Build succeeded. public/ is ready to serve.\n");
