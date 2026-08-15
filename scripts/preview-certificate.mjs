/* =========================================================
   npm run preview:certificate

   Writes preview/certificate-preview.html — a standalone page
   that renders the certificate using the real stylesheet, the
   real markup and the real rendering module, filled with
   sample data.

   Open it in a browser to check the design, and use the
   browser's own print dialog to check the A4 landscape sheet,
   without deploying anything and without issuing a real
   certificate.

   The file is written outside public/, so it is never part of
   the deployed site and no visitor can reach it.
   ========================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const outDir = path.join(root, "preview");
const outFile = path.join(outDir, "certificate-preview.html");

/* Sample data only. Nothing here is stored, and this certificate
   number does not exist in any certificate store. */
const SAMPLE = {
  certificate_id: "SEC-ACADEMY-2026-000001",
  student_name: "Lawrence M. Fabul",
  course_title: "Security Management Fundamentals",
  completion_date: "2026-08-15",
  status: "VALID",
  verification_url:
    "https://security-training-academy.example/verify?id=SEC-ACADEMY-2026-000001"
};

/* The certificate markup is lifted verbatim from
   public/certificate-generator.html so the preview cannot drift
   away from the page that actually prints. */
const generator = fs.readFileSync(
  path.join(root, "public", "certificate-generator.html"),
  "utf8"
);

const start = generator.indexOf('<div class="cert-stage"');
const end = generator.indexOf("</div>", generator.lastIndexOf("</div>\n        </div>"));
if (start === -1) {
  console.error(
    "Could not find the certificate markup in public/certificate-generator.html."
  );
  process.exit(1);
}

/* Take from the stage opening to the end of the stage block. */
let depth = 0;
let index = start;
let stageMarkup = "";
const source = generator;
while (index < source.length) {
  if (source.startsWith("<div", index)) depth += 1;
  if (source.startsWith("</div>", index)) {
    depth -= 1;
    if (depth === 0) {
      stageMarkup = source.slice(start, index + 6);
      break;
    }
  }
  index += 1;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate design preview | Security Training Academy</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="../public/assets/css/fonts.css">
<link rel="stylesheet" href="../public/assets/css/styles.css">
<link rel="stylesheet" href="../public/assets/css/certificate.css">
<link rel="stylesheet" href="../public/assets/css/print.css" media="print">
<style>
  body { background: #eef1f7; margin: 0; padding: 24px; }
  .preview-note {
    max-width: 297mm; margin: 0 auto 18px; font-family: var(--mono);
    font-size: 12px; letter-spacing: .06em; color: #55607a; line-height: 1.7;
  }
  .preview-note b { color: #08152f; }
  #cert-stage { max-width: 297mm; margin: 0 auto; }
  @media print { .preview-note { display: none !important; } body { padding: 0; background: #fff; } }
</style>
</head>
<body>

<div class="preview-note no-print">
  <b>CERTIFICATE DESIGN PREVIEW</b> &middot; sample data, not a real certificate.<br>
  Rendered from the same markup, stylesheet and rendering module used by the live
  certificate generator. Print this page to check the A4 landscape sheet.
</div>

${stageMarkup.replace(/\bhidden\b/, "").replace(/src="assets\//g, 'src="../public/assets/')}

<script src="../public/assets/vendor/qrcode.min.js"></script>
<script src="../public/assets/js/signature-config.js"></script>
<script src="../public/assets/js/certificate-render.js"></script>
<script>
  /* This preview page lives in preview/, one level away from public/, so a
     signature path configured relative to the site root has to be adjusted
     before rendering. The live generator needs no such adjustment. */
  (function () {
    var s = window.STA_SIGNATURE;
    if (!s || !s.image) return;
    var absolute = s.image.indexOf("http") === 0 ||
                   s.image.indexOf("data:") === 0 ||
                   s.image.charAt(0) === "/" ||
                   s.image.indexOf("..") === 0;
    if (!absolute) s.image = "../public/" + s.image;
  })();

  var SAMPLE = ${JSON.stringify(SAMPLE, null, 2)};
  window.STACertificate.render(SAMPLE);

  function fit() {
    var stage = document.getElementById("cert-stage");
    var scaler = document.getElementById("cert-scaler");
    var scale = Math.min(1, stage.clientWidth / (scaler.offsetWidth || 1));
    scaler.style.transform = "scale(" + scale + ")";
    stage.style.height = scaler.offsetHeight * scale + "px";
  }
  fit();
  window.addEventListener("resize", fit);
</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, "utf8");
console.log("Wrote " + path.relative(process.cwd(), outFile));
console.log("Open it in a browser to review the certificate design.");
