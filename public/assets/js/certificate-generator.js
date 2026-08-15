/* =========================================================
   CERTIFICATE GENERATOR (administrator only)

   The page is revealed only after the server confirms a valid
   session, and every certificate is created by the server,
   which checks the session again. Nothing in this file can
   mint a certificate on its own, and no credential of any
   kind appears here.
   ========================================================= */
(function () {
  "use strict";

  const courses = (window.STA_COURSES || []).filter(
    (c) => c.status === "ACTIVE" && c.certificateEligible === true
  );

  const gate = document.getElementById("gate");
  const gateMessage = document.getElementById("gate-message");
  const header = document.getElementById("admin-header");
  const main = document.getElementById("main");
  const who = document.getElementById("admin-who");
  const storageWarning = document.getElementById("storage-warning");

  const form = document.getElementById("cert-form");
  const studentInput = document.getElementById("student");
  const courseSelect = document.getElementById("cert-course");
  const dateInput = document.getElementById("completion");
  const status = document.getElementById("cert-status");
  const generateBtn = document.getElementById("generate-btn");

  const stage = document.getElementById("cert-stage");
  const scaler = document.getElementById("cert-scaler");
  const emptyState = document.getElementById("empty-state");
  const resultBar = document.getElementById("result-bar");
  const verifyLinkEl = document.getElementById("verify-link");
  const openVerify = document.getElementById("open-verify");
  const recentList = document.getElementById("recent-list");

  let currentUrl = "";

  function say(message, kind) {
    status.textContent = message || "";
    status.className = "form-status " + (kind || "is-ok");
  }

  function fieldError(fieldId, errorId, message) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(errorId);
    if (field) field.classList.toggle("has-error", Boolean(message));
    if (error) error.textContent = message || "";
  }

  function clearErrors() {
    fieldError("f-student", "e-student", "");
    fieldError("f-course", "e-course", "");
    fieldError("f-completion", "e-completion", "");
  }

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ---------- Gate ---------- */
  fetch("/api/admin/session", { credentials: "same-origin" })
    .then((res) => {
      if (res.status === 401) throw new Error("unauthenticated");
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    })
    .then((data) => {
      document.body.classList.remove("is-gated");
      gate.hidden = true;
      header.hidden = false;
      main.hidden = false;
      who.textContent = data.email || "";

      if (data.storage && data.storage.persistent === false) {
        storageWarning.hidden = false;
        storageWarning.className = "form-status is-err";
        storageWarning.textContent =
          "Storage warning: " +
          (data.storage.warning || "certificates may not be stored permanently.");
      }

      /* Shows which numbering scheme the SERVER is running, so a stale
         deployment is obvious here rather than only after issuing a
         certificate with the wrong kind of number. */
      showNumbering();
      start();
    })
    .catch((error) => {
      if (error.message === "unauthenticated") {
        window.location.replace("admin-login.html");
        return;
      }
      gateMessage.innerHTML =
        "The authentication service could not be reached.<br>" +
        "If you are previewing locally, start the site with <code>npm run dev</code> " +
        "so the API routes are available.";
    });

  /* ---------- Which numbering scheme is live ---------- */
  function showNumbering() {
    fetch("/api/admin/setup-status")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var n = data && data.numbering;
        var hint = document.getElementById("numbering-hint");
        if (!hint) return;
        if (!n) {
          hint.textContent =
            "This deployment is running an older version that does not report " +
            "its numbering scheme.";
          hint.className = "form-status is-err";
          return;
        }
        hint.textContent =
          "Certificate numbers: " + n.format + " \u2014 for example " + n.example + ".";
        hint.className = "form-status is-info";
      })
      .catch(function () { /* not important enough to interrupt anything */ });
  }

  /* ---------- Signed-in administrators only ---------- */
  function start() {
    if (!courses.length) {
      say(
        "No course is currently marked as active and certificate-eligible. Update lib/courses.js and redeploy.",
        "is-err"
      );
      generateBtn.disabled = true;
    }

    courses.forEach((course) => {
      const option = document.createElement("option");
      option.value = course.courseId;
      option.textContent = course.courseTitle;
      courseSelect.appendChild(option);
    });

    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    dateInput.value =
      today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

    loadRecent();

    form.addEventListener("submit", onGenerate);
    document.getElementById("print-btn").addEventListener("click", () => window.print());
    document.getElementById("copy-btn").addEventListener("click", copyLink);
    document.getElementById("logout-btn").addEventListener("click", logout);
    window.addEventListener("resize", fitCertificate);
  }

  function onGenerate(event) {
    event.preventDefault();
    clearErrors();
    say("");

    const studentName = studentInput.value.trim().replace(/\s+/g, " ");
    const courseId = courseSelect.value;
    const completionDate = dateInput.value;

    let valid = true;
    if (studentName.length < 2) {
      fieldError("f-student", "e-student", "Enter the student's full name.");
      valid = false;
    }
    if (!courseId) {
      fieldError("f-course", "e-course", "Choose a course.");
      valid = false;
    }
    if (!completionDate) {
      fieldError("f-completion", "e-completion", "Choose a completion date.");
      valid = false;
    }
    if (!valid) {
      const firstError = document.querySelector(".field.has-error input, .field.has-error select");
      if (firstError) firstError.focus();
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating\u2026";

    fetch("/api/certificates/create", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: studentName,
        courseId: courseId,
        completionDate: completionDate
      })
    })
      .then((res) => {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session expired");
        }
        return res.json().then((data) => ({ ok: res.ok, data: data }));
      })
      .then((result) => {
        if (!result.ok) {
          say(result.data.error || "The certificate could not be created.", "is-err");
          return;
        }
        const outcome = show(result.data.certificate);
        loadRecent();
        if (outcome.qrOk) {
          say(
            "Certificate " + result.data.certificate.certificate_id + " issued and saved.",
            "is-ok"
          );
        } else {
          say(
            "Certificate " +
              result.data.certificate.certificate_id +
              " was issued and saved, but the QR code could not be drawn. Reload the page and reopen it from Recently issued before printing.",
            "is-err"
          );
        }
      })
      .catch((error) => {
        if (error.message === "session expired") return;
        say(
          "Could not reach the certificate service. Check your connection and try again. No certificate was issued.",
          "is-err"
        );
      })
      .finally(() => {
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate certificate";
      });
  }

  /* ---------- Show a record on the sheet ---------- */
  function show(record) {
    const outcome = window.STACertificate.render(record);

    currentUrl = record.verification_url || "";
    verifyLinkEl.textContent = currentUrl;
    openVerify.href = "verify.html?id=" + encodeURIComponent(record.certificate_id);

    emptyState.hidden = true;
    stage.hidden = false;
    resultBar.classList.add("is-shown");
    fitCertificate();

    return outcome;
  }

  /* ---------- Fit the A4 sheet into its column ---------- */
  function fitCertificate() {
    if (!stage || stage.hidden) return;
    const available = stage.clientWidth;
    const natural = scaler.offsetWidth || 1;
    const scale = Math.min(1, available / natural);
    scaler.style.transform = "scale(" + scale + ")";
    stage.style.height = scaler.offsetHeight * scale + "px";
  }

  /* ---------- Recently issued ---------- */
  function loadRecent() {
    fetch("/api/certificates/list?limit=8", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.certificates.length) {
          recentList.textContent = "No certificates have been issued yet.";
          return;
        }
        recentList.innerHTML = data.certificates
          .map((c) => {
            const valid = c.status === "VALID";
            return (
              '<div class="record">' +
              '<button class="record__open" type="button" data-reopen=\'' +
              esc(JSON.stringify(c)) +
              "'>" +
              '<span class="record__id">' + esc(c.certificate_id) + "</span>" +
              '<span class="record__nm">' + esc(c.student_name) + "</span>" +
              '<span class="record__sub">' + esc(c.course_title) + "</span>" +
              "</button>" +
              '<span class="record__st ' + (valid ? "ok" : "no") + '">' +
              esc(c.status) +
              "</span>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(() => {
        recentList.textContent = "Could not load recent certificates.";
      });
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest("[data-reopen]");
    if (!item) return;
    try {
      const record = JSON.parse(item.getAttribute("data-reopen"));
      show(record);
      say(
        record.status === "REVOKED"
          ? "Reopened. This certificate is REVOKED and is stamped accordingly."
          : "Reopened. Use Print / Save as PDF for another copy.",
        record.status === "REVOKED" ? "is-err" : "is-ok"
      );
    } catch {
      /* ignore a malformed entry */
    }
  });

  /* ---------- Copy link ---------- */
  function copyLink() {
    if (!currentUrl) return;
    const done = () => say("Verification link copied.", "is-ok");
    const fail = () => say("Could not copy automatically. The link is shown above.", "is-err");

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(currentUrl).then(done).catch(fail);
      return;
    }
    try {
      const temp = document.createElement("textarea");
      temp.value = currentUrl;
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
      done();
    } catch {
      fail();
    }
  }

  /* ---------- Sign out ---------- */
  function logout() {
    fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" })
      .finally(() => window.location.replace("admin-login.html"));
  }
})();
