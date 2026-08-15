/* =========================================================
   PUBLIC CERTIFICATE VERIFICATION

   Reads ?id= from the URL (a QR scan) or an ID typed in, then
   asks the server. No certificate data is held in the browser,
   and no certificate is ever listed: a record is shown only
   when a specific, valid certificate number is supplied.
   ========================================================= */
(function () {
  "use strict";

  const ID_PATTERN = /^SEC-ACADEMY-\d{4}-\d{6}$/;

  const form = document.getElementById("verify-form");
  const input = document.getElementById("cert-id");
  const button = document.getElementById("verify-btn");
  const verdict = document.getElementById("verdict");
  const mark = document.getElementById("verdict-mark");
  const title = document.getElementById("verdict-title");
  const sub = document.getElementById("verdict-sub");
  const details = document.getElementById("verdict-details");
  const note = document.getElementById("verdict-note");

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function longDate(iso) {
    const date = new Date(String(iso) + "T00:00:00");
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric"
    });
  }

  function row(label, value, mono) {
    return (
      "<dt>" + esc(label) + "</dt>" +
      "<dd" + (mono ? ' class="mono"' : "") + ">" + value + "</dd>"
    );
  }

  function normalise(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function showValid(data) {
    verdict.className = "verdict is-valid is-shown";
    mark.textContent = "\u2713";
    title.textContent = "Certificate verified";
    sub.textContent = "Valid certificate";

    details.innerHTML =
      row("Certificate number", esc(data.certificate_id), true) +
      row("This certifies that", esc(data.student_name)) +
      row("Successfully completed", esc(data.course_title)) +
      row("Completion date", esc(longDate(data.completion_date))) +
      row("Issued by", esc(data.issuing_organisation || "Philippine Security and Safety Professional")) +
      row("Status", '<span class="status-pill">VALID</span>');

    note.innerHTML =
      "<p>This record confirms completion of the course named above. It is a Certificate " +
      "of Completion issued by the Security Training Academy of the Philippine Security " +
      "and Safety Professional, and is not a government licence or accreditation.</p>" +
      '<p style="margin-bottom:0">If any detail above does not match the printed ' +
      "certificate, do not rely on that document.</p>";
  }

  function showRevoked(data) {
    verdict.className = "verdict is-revoked is-shown";
    mark.textContent = "\u26A0";
    title.textContent = "Certificate revoked";
    sub.textContent = "This certificate is no longer valid";

    details.innerHTML =
      row("Certificate number", esc(data.certificate_id), true) +
      (data.revoked_on ? row("Revoked on", esc(longDate(data.revoked_on))) : "") +
      row("Status", '<span class="status-pill status-pill--warn">REVOKED</span>');

    note.innerHTML =
      '<p style="margin-bottom:0">A certificate with this number was issued but has since ' +
      "been revoked by the academy. It must not be treated as evidence of course " +
      "completion.</p>";
  }

  function showNotFound(id) {
    verdict.className = "verdict is-invalid is-shown";
    mark.textContent = "\u2715";
    title.textContent = "Certificate not found";
    sub.textContent = "No matching record";

    details.innerHTML =
      (id ? row("Searched for", esc(id), true) : "") +
      row("Status", '<span class="status-pill status-pill--bad">NOT FOUND</span>');

    note.innerHTML =
      '<p style="margin-bottom:0">Check the number against the printed certificate. It ' +
      "reads SEC-ACADEMY, then a four-digit year, then a six-digit number — for example " +
      "SEC-ACADEMY-2026-000001.</p>";
  }

  function showUnavailable() {
    verdict.className = "verdict is-invalid is-shown";
    mark.textContent = "!";
    title.textContent = "Verification unavailable";
    sub.textContent = "The service could not be reached";
    details.innerHTML = "";
    note.innerHTML =
      '<p style="margin-bottom:0">This is a temporary problem on our side, not a ' +
      "judgement about the certificate. Please try again shortly.</p>";
  }

  function setBusy(busy) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? "Checking\u2026" : "Verify certificate";
  }

  function verify(rawId, updateUrl) {
    const id = normalise(rawId);

    if (!id) {
      showNotFound("");
      input.focus();
      return;
    }

    input.value = id;

    if (updateUrl && window.history && window.history.replaceState) {
      window.history.replaceState(
        {}, "", window.location.pathname + "?id=" + encodeURIComponent(id)
      );
    }

    /* An obviously malformed number is answered here rather than
       troubling the server, and with the same wording the server
       would have used. */
    if (!ID_PATTERN.test(id)) {
      showNotFound(id);
      return;
    }

    setBusy(true);

    fetch("/api/verify?id=" + encodeURIComponent(id))
      .then(function (res) {
        if (!res.ok) throw new Error("unavailable");
        return res.json();
      })
      .then(function (data) {
        if (!data.found) { showNotFound(id); return; }
        if (data.status === "REVOKED") { showRevoked(data); return; }
        showValid(data);
      })
      .catch(showUnavailable)
      .finally(function () {
        setBusy(false);
        verdict.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    verify(input.value, true);
  });

  /* A QR scan arrives with the number already in the URL. */
  const fromUrl = new URLSearchParams(window.location.search).get("id");
  if (fromUrl) verify(fromUrl, false);
})();
