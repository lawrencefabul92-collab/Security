/* =========================================================
   ADMINISTRATOR SIGN IN

   Credentials are checked entirely on the server. This file
   contains no password, no hash, and no secret of any kind.
   ========================================================= */
(function () {
  "use strict";

  const form = document.getElementById("login-form");
  const status = document.getElementById("login-status");
  const button = document.getElementById("login-btn");
  const setupHint = document.getElementById("setup-hint");
  const setupLink = document.getElementById("setup-link");

  function say(message, kind) {
    status.textContent = message || "";
    status.className = "form-status " + (kind || "is-err");
  }

  /* Already signed in? Go straight through. */
  fetch("/api/admin/session", { credentials: "same-origin" })
    .then(function (res) {
      if (res.ok) window.location.replace("admin.html");
    })
    .catch(function () { /* API unavailable locally — stay on the form */ });

  /* Tell the administrator whether setup is still open. */
  fetch("/api/admin/setup-status")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data) {
        setupHint.textContent = "Could not reach the account service.";
        return;
      }
      if (data.configured) {
        setupHint.textContent =
          "An administrator account already exists" +
          (data.source === "environment"
            ? ", provisioned from environment variables."
            : ". Setup is closed.");
        return;
      }
      setupHint.textContent =
        "No administrator account exists yet. Create one now — the setup page closes as soon as you do.";
      setupLink.hidden = false;
    })
    .catch(function () {
      setupHint.textContent = "Could not reach the account service.";
    });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      say("Enter your email address and password.", "is-err");
      return;
    }

    button.disabled = true;
    button.textContent = "Signing in\u2026";
    say("");

    fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          window.location.replace("admin.html");
          return;
        }
        say(result.data.error || "Sign in failed.", "is-err");
      })
      .catch(function () {
        say(
          "Could not reach the authentication service. If you are previewing locally, " +
          "start the site with npm run dev so the API routes are available.",
          "is-err"
        );
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Sign in";
      });
  });
})();
