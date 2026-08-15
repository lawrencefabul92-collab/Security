/* =========================================================
   npm run sync:courses

   Regenerates public/assets/js/courses.js from lib/courses.js
   so the browser and the server can never disagree about
   which courses exist, what they cost, or which of them may
   receive a certificate.

   lib/courses.js is the file you edit. This one is generated.
   ========================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSES } from "../lib/courses.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "..", "public", "assets", "js", "courses.js");

const banner = `/* =========================================================
   COURSE CATALOGUE — GENERATED FILE. DO NOT EDIT.

   Edit lib/courses.js, then run:  npm run sync:courses

   Editing this file by hand will make the website disagree
   with the server, and the server always wins: a course the
   server does not recognise cannot receive a certificate.
   ========================================================= */

`;

const body =
  "const STA_COURSES = " +
  JSON.stringify(COURSES, null, 2) +
  ";\n\n" +
  `if (typeof window !== "undefined") {\n  window.STA_COURSES = STA_COURSES;\n}\n`;

fs.writeFileSync(target, banner + body, "utf8");

const active = COURSES.filter((c) => c.status === "ACTIVE").length;
const soon = COURSES.filter((c) => c.status === "COMING_SOON").length;
const certifiable = COURSES.filter(
  (c) => c.status === "ACTIVE" && c.certificateEligible
).length;

console.log(
  `Wrote ${path.relative(process.cwd(), target)} — ` +
    `${COURSES.length} courses (${active} active, ${soon} coming soon, ` +
    `${certifiable} certificate-eligible).`
);

/* Guard against the two mistakes that break the system quietly. */
const ids = COURSES.map((c) => c.courseId);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) {
  console.error("DUPLICATE courseId values:", duplicates.join(", "));
  process.exit(1);
}
const badStatus = COURSES.filter(
  (c) => !["ACTIVE", "INACTIVE", "COMING_SOON"].includes(c.status)
);
if (badStatus.length) {
  console.error(
    "Invalid status on:",
    badStatus.map((c) => c.courseId).join(", ")
  );
  process.exit(1);
}
