/* =========================================================
   CERTIFICATE RENDERING

   One function that paints a certificate record into the
   markup. The generator uses it, and the offline design
   preview uses the same function against the same markup and
   the same stylesheet, so what is reviewed is what prints.

   It renders. It never issues. A record must already exist,
   and only the server can create one.
   ========================================================= */
(function (global) {
  "use strict";

  function longDate(iso) {
    const d = new Date(String(iso) + "T00:00:00");
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  /* Long names and long course titles step down a size rather than
     wrapping into the block beneath them. */
  function fitText(el, text, thresholds) {
    el.textContent = text;
    el.classList.remove("is-long", "is-very-long");
    const n = String(text).length;
    if (thresholds.veryLong && n > thresholds.veryLong) {
      el.classList.add("is-very-long");
    } else if (n > thresholds.long) {
      el.classList.add("is-long");
    }
  }

  function drawQr(box, url) {
    /* Error-correction level M, which tolerates a scuffed or lightly
       marked print while keeping the module count low enough to stay
       scannable at 29mm. */
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const svg = box.querySelector("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "QR code linking to the certificate verification page");
    }
  }

  function applySignature() {
    const config = global.STA_SIGNATURE || {};
    const placeholder = document.getElementById("c-sign-placeholder");
    const placeholderText = document.getElementById("c-sign-placeholder-text");
    const image = document.getElementById("c-sign-image");
    const name = document.getElementById("c-sign-name");
    const credentials = document.getElementById("c-sign-credentials");
    const role = document.getElementById("c-sign-role");

    if (name && config.name) name.textContent = config.name;
    if (credentials && config.credentials) credentials.textContent = config.credentials;
    if (role && config.role) role.textContent = config.role;
    if (placeholderText && config.placeholder) {
      placeholderText.textContent = config.placeholder;
    }

    /* No signature image configured: the placeholder stays. This
       system never generates a handwritten signature. */
    if (!config.image) {
      if (image) { image.hidden = true; image.removeAttribute("src"); }
      if (placeholder) placeholder.hidden = false;
      return;
    }

    if (image) {
      image.src = config.image;
      image.alt = config.imageAlt || "Authorised signature";
      image.hidden = false;
      /* If the configured file is missing, fall back to the
         placeholder rather than printing a broken image icon. */
      image.onerror = function () {
        image.hidden = true;
        if (placeholder) placeholder.hidden = false;
      };
    }
    if (placeholder) placeholder.hidden = true;
  }

  /* Fills the microprint band with as many repetitions as fit. */
  function applyMicroprint(url) {
    const band = document.getElementById("c-microprint");
    if (!band) return;
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      host = "";
    }
    const unit =
      "SECURITY TRAINING ACADEMY \u00B7 PHILIPPINE SECURITY AND SAFETY PROFESSIONAL \u00B7 " +
      (host ? "VERIFY AT " + host.toUpperCase() + " \u00B7 " : "");
    band.textContent = unit.repeat(6);
  }

  /**
   * @param {object} record  a certificate record from the server
   * @param {object} [opts]  { revoked: boolean }
   */
  function renderCertificate(record, opts) {
    const options = opts || {};

    const name = document.getElementById("c-name");
    const course = document.getElementById("c-course");
    const date = document.getElementById("c-date");
    const id = document.getElementById("c-id");
    const host = document.getElementById("c-host");
    const qrBox = document.getElementById("c-qr");
    const sheet = document.getElementById("certificate");

    if (name) fitText(name, record.student_name, { long: 26, veryLong: 36 });
    if (course) fitText(course, record.course_title, { long: 42 });
    if (date) date.textContent = longDate(record.completion_date);
    if (id) id.textContent = record.certificate_id;

    const url = record.verification_url || "";

    if (host) {
      try {
        host.textContent = new URL(url).host;
      } catch {
        host.textContent = "";
      }
    }

    let qrOk = true;
    if (qrBox && url) {
      try {
        drawQr(qrBox, url);
      } catch (error) {
        qrOk = false;
        qrBox.innerHTML = "";
        console.error("QR generation failed:", error);
      }
    }

    applySignature();
    applyMicroprint(url);

    if (sheet) {
      const revoked =
        options.revoked === true || record.status === "REVOKED";
      sheet.classList.toggle("is-revoked", revoked);
    }

    return { qrOk: qrOk };
  }

  global.STACertificate = {
    render: renderCertificate,
    longDate: longDate
  };
})(window);
