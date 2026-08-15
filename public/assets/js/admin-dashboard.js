/* =========================================================
   ADMINISTRATOR DASHBOARD

   Every request below is made with the session cookie and is
   authorised again on the server. The page gate is a
   convenience: hiding the interface is not what protects the
   data, the API is.
   ========================================================= */
(function () {
  "use strict";

  const gate = document.getElementById("gate");
  const gateMessage = document.getElementById("gate-message");
  const header = document.getElementById("admin-header");
  const main = document.getElementById("main");
  const who = document.getElementById("admin-who");
  const storageWarning = document.getElementById("storage-warning");

  const certList = document.getElementById("cert-list");
  const certStatus = document.getElementById("cert-status");
  const moreWrap = document.getElementById("cert-more-wrap");
  const moreButton = document.getElementById("cert-more");

  const inqList = document.getElementById("inq-list");
  const inqStatus = document.getElementById("inq-status");

  const findForm = document.getElementById("find-form");
  const findInput = document.getElementById("find-id");
  const findStatus = document.getElementById("find-status");
  const findResult = document.getElementById("find-result");

  const PAGE = 25;
  let offset = 0;
  let loaded = [];

  const esc = function (value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  function say(el, message, kind) {
    el.textContent = message || "";
    el.className = "form-status " + (kind || "is-ok");
  }

  function longDate(iso) {
    const date = new Date(String(iso) + "T00:00:00");
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleDateString("en-PH", {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  /* ---------- Gate ---------- */
  fetch("/api/admin/session", { credentials: "same-origin" })
    .then(function (res) {
      if (res.status === 401) throw new Error("unauthenticated");
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    })
    .then(function (data) {
      document.body.classList.remove("is-gated");
      gate.hidden = true;
      header.hidden = false;
      main.hidden = false;
      who.textContent = data.email || "";

      if (data.storage && data.storage.persistent === false) {
        storageWarning.hidden = false;
        storageWarning.textContent =
          "Storage warning: " +
          (data.storage.warning || "records may not be stored permanently.");
      }

      start();
    })
    .catch(function (error) {
      if (error.message === "unauthenticated") {
        window.location.replace("admin-login.html");
        return;
      }
      gateMessage.innerHTML =
        "The authentication service could not be reached.<br>" +
        "If you are previewing locally, start the site with <code>npm run dev</code>.";
    });

  function start() {
    loadCertificates(true);
    loadInquiries();

    document.getElementById("logout-btn").addEventListener("click", function () {
      fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" })
        .finally(function () { window.location.replace("admin-login.html"); });
    });

    moreButton.addEventListener("click", function () { loadCertificates(false); });

    document.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        const name = tab.getAttribute("data-tab");
        document.querySelectorAll(".admin-tab").forEach(function (other) {
          const active = other === tab;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-selected", String(active));
        });
        document.getElementById("tab-certificates").hidden = name !== "certificates";
        document.getElementById("tab-inquiries").hidden = name !== "inquiries";
      });
    });

    findForm.addEventListener("submit", onFind);
  }

  /* ---------- Certificates ---------- */
  function certificateRow(record) {
    const valid = record.status === "VALID";
    return (
      '<div class="record" data-id="' + esc(record.certificate_id) + '">' +
        '<div class="record__open" style="cursor:default">' +
          '<span class="record__id">' + esc(record.certificate_id) + "</span>" +
          '<span class="record__nm">' + esc(record.student_name) + "</span>" +
          '<span class="record__sub">' + esc(record.course_title) +
            " \u00B7 completed " + esc(longDate(record.completion_date)) + "</span>" +
        "</div>" +
        '<span class="record__st ' + (valid ? "ok" : "no") + '">' +
          esc(record.status) + "</span>" +
        '<span class="record__actions">' +
          '<a class="record__act" href="verify.html?id=' +
            encodeURIComponent(record.certificate_id) +
            '" target="_blank" rel="noopener">Verify</a>' +
          '<button class="record__act" type="button" data-setstatus="' +
            (valid ? "REVOKED" : "VALID") + '" data-id="' +
            esc(record.certificate_id) + '">' +
            (valid ? "Revoke" : "Restore") + "</button>" +
          '<button class="record__act record__act--danger" type="button" data-delete="' +
            esc(record.certificate_id) + '" data-name="' +
            esc(record.student_name) + '">Delete</button>' +
        "</span>" +
      "</div>"
    );
  }

  function loadCertificates(reset) {
    if (reset) { offset = 0; loaded = []; }

    fetch("/api/certificates/list?limit=" + PAGE + "&offset=" + offset, {
      credentials: "same-origin"
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session");
        }
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(function (data) {
        loaded = loaded.concat(data.certificates);
        offset += data.certificates.length;

        if (!loaded.length) {
          certList.innerHTML =
            '<div class="record"><div class="record__open" style="cursor:default">' +
            '<span class="record__nm">No certificates have been issued yet.</span>' +
            '<span class="record__sub">Use New certificate to issue the first one.</span>' +
            "</div></div>";
        } else {
          certList.innerHTML = loaded.map(certificateRow).join("");
        }

        moreWrap.hidden = offset >= data.total;

        document.getElementById("stat-total").textContent = String(data.total);
        const valid = loaded.filter(function (r) { return r.status === "VALID"; }).length;
        document.getElementById("stat-valid").textContent = String(valid);
        document.getElementById("stat-revoked").textContent =
          String(loaded.length - valid);
      })
      .catch(function (error) {
        if (error.message === "session") return;
        certList.textContent = "Could not load certificates.";
      });
  }

  /* ---------- Find one ---------- */
  function onFind(event) {
    event.preventDefault();
    findResult.innerHTML = "";

    const id = findInput.value.trim().toUpperCase().replace(/\s+/g, "");
    if (!id) { say(findStatus, "Enter a certificate number.", "is-err"); return; }

    say(findStatus, "");

    fetch("/api/certificates/find?id=" + encodeURIComponent(id), {
      credentials: "same-origin"
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session");
        }
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          say(findStatus, result.data.error || "Not found.", "is-err");
          return;
        }
        findResult.innerHTML =
          '<div class="records" style="margin-top:1.2rem">' +
          certificateRow(result.data.certificate) +
          "</div>";
        say(findStatus, "");
      })
      .catch(function (error) {
        if (error.message === "session") return;
        say(findStatus, "Could not reach the certificate service.", "is-err");
      });
  }

  /* ---------- Revoke and restore ---------- */
  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-setstatus]");
    if (!button) return;

    const id = button.getAttribute("data-id");
    const status = button.getAttribute("data-setstatus");
    const verb = status === "REVOKED" ? "Revoke" : "Restore";

    if (!window.confirm(
      verb + " " + id + "?\n\n" +
      "A revoked certificate stays on record and reports as REVOKED when verified, " +
      "which leaves an audit trail."
    )) return;

    button.disabled = true;
    fetch("/api/certificates/revoke", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, status: status })
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session");
        }
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          say(certStatus, result.data.error || "Could not update that certificate.", "is-err");
          return;
        }
        say(certStatus, id + " is now " + status + ".", "is-ok");
        findResult.innerHTML = "";
        loadCertificates(true);
      })
      .catch(function (error) {
        if (error.message === "session") return;
        say(certStatus, "Could not reach the certificate service.", "is-err");
      })
      .finally(function () { button.disabled = false; });
  });

  /* ---------- Permanent delete ---------- */
  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-delete]");
    if (!button) return;

    const id = button.getAttribute("data-delete");
    const name = button.getAttribute("data-name") || "";

    if (!window.confirm(
      "Permanently delete " + id + "?\n\nStudent: " + name +
      "\n\nThis cannot be undone. The number will report NOT FOUND when verified, " +
      "which looks identical to a number that never existed." +
      "\n\nFor a genuinely issued certificate, use Revoke instead so the record is kept."
    )) return;

    button.disabled = true;
    fetch("/api/certificates/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session");
        }
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          say(certStatus, result.data.error || "Could not delete that certificate.", "is-err");
          return;
        }
        say(certStatus, id + " deleted.", "is-ok");
        findResult.innerHTML = "";
        loadCertificates(true);
      })
      .catch(function (error) {
        if (error.message === "session") return;
        say(certStatus, "Could not reach the certificate service.", "is-err");
      })
      .finally(function () { button.disabled = false; });
  });

  /* ---------- Inquiries ---------- */
  function loadInquiries() {
    fetch("/api/inquiry?limit=25", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("admin-login.html");
          throw new Error("session");
        }
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(function (data) {
        document.getElementById("stat-inquiries").textContent =
          String(data.unhandled || 0);

        if (!data.inquiries.length) {
          inqList.innerHTML =
            '<div class="record"><div class="record__open" style="cursor:default">' +
            '<span class="record__nm">No inquiries yet.</span>' +
            "</div></div>";
          return;
        }

        inqList.innerHTML = data.inquiries
          .map(function (record) {
            const isNew = record.status === "NEW";
            return (
              '<div class="record">' +
                '<div class="record__open" style="cursor:default">' +
                  '<span class="record__id">' + esc(record.inquiry_id) + "</span>" +
                  '<span class="record__nm">' + esc(record.full_name) + "</span>" +
                  '<span class="record__sub">' +
                    esc(record.email) + " \u00B7 " + esc(record.mobile) +
                    (record.course_title ? " \u00B7 " + esc(record.course_title) : "") +
                  "</span>" +
                  (record.message
                    ? '<span class="record__sub" style="white-space:normal;color:var(--ink);margin-top:.4rem">' +
                      esc(record.message) + "</span>"
                    : "") +
                "</div>" +
                '<span class="record__st ' + (isNew ? "new" : "ok") + '">' +
                  esc(record.status) + "</span>" +
                '<span class="record__actions">' +
                  '<a class="record__act" href="mailto:' + esc(record.email) + '">Reply</a>' +
                  '<button class="record__act" type="button" data-inq-mark="' +
                    esc(record.inquiry_id) + '" data-status="' +
                    (isNew ? "HANDLED" : "NEW") + '">' +
                    (isNew ? "Mark handled" : "Reopen") + "</button>" +
                  '<button class="record__act record__act--danger" type="button" data-inq-delete="' +
                    esc(record.inquiry_id) + '">Delete</button>' +
                "</span>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function (error) {
        if (error.message === "session") return;
        inqList.textContent = "Could not load inquiries.";
      });
  }

  document.addEventListener("click", function (event) {
    const mark = event.target.closest("[data-inq-mark]");
    if (mark) {
      const id = mark.getAttribute("data-inq-mark");
      const status = mark.getAttribute("data-status");
      mark.disabled = true;
      fetch(
        "/api/inquiry?mark=" + encodeURIComponent(id) + "&status=" + status,
        { credentials: "same-origin" }
      )
        .then(function (res) { return res.json(); })
        .then(function () { loadInquiries(); })
        .catch(function () { say(inqStatus, "Could not update that inquiry.", "is-err"); })
        .finally(function () { mark.disabled = false; });
      return;
    }

    const remove = event.target.closest("[data-inq-delete]");
    if (!remove) return;

    const id = remove.getAttribute("data-inq-delete");
    if (!window.confirm("Delete inquiry " + id + "? This cannot be undone.")) return;

    remove.disabled = true;
    fetch("/api/inquiry?remove=" + encodeURIComponent(id), {
      credentials: "same-origin"
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        say(inqStatus, id + " deleted.", "is-ok");
        loadInquiries();
      })
      .catch(function () { say(inqStatus, "Could not delete that inquiry.", "is-err"); })
      .finally(function () { remove.disabled = false; });
  });
})();
