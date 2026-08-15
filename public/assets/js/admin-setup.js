/* =========================================================
   ONE-TIME ADMINISTRATOR SETUP

   The page only offers the form when the server confirms no
   account exists. That check is a convenience: the server
   refuses a second setup regardless of what this page shows,
   and the write is conditional, so two setup requests arriving
   together cannot both succeed.
   ========================================================= */
(function () {
  "use strict";

  const checking = document.getElementById("checking-panel");
  const setupPanel = document.getElementById("setup-panel");
  const closedPanel = document.getElementById("closed-panel");
  const closedReason = document.getElementById("closed-reason");

  const form = document.getElementById("setup-form");
  const status = document.getElementById("setup-status");
  const button = document.getElementById("setup-btn");

  function say(message, kind) {
    status.textContent = message || "";
    status.className = "form-status " + (kind || "is-err");
  }

  function showClosed(reason) {
    checking.hidden = true;
    setupPanel.hidden = true;
    closedPanel.hidden = false;
    if (reason) closedReason.textContent = reason;
  }

  fetch("/api/admin/setup-status")
    .then(function (res) {
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    })
    .then(function (data) {
      if (data.configured) {
        showClosed(
          data.source === "environment"
            ? "An administrator account is provisioned from this deployment's environment variables."
            : "An administrator account already exists for this deployment."
        );
        return;
      }
      checking.hidden = true;
      setupPanel.hidden = false;

      const diagnostics = data.diagnostics || {};
      const notPersistent = data.storage && data.storage.persistent === false;

      /* The local file store is a perfectly good development backend, so
         setup must still work there. Only a DEPLOYMENT with no usable
         connection is a dead end worth blocking. */
      if (notPersistent && diagnostics.onVercel) {
        /* Names of environment variables only. No value, host or token is
           ever sent to the browser. */
        const found = diagnostics.variablesFound || [];
        say(
          "Storage is not connected, so an account cannot be created yet. " +
            (data.storage.warning || "") +
            (found.length
              ? " Variables visible to this deployment: " + found.join(", ") + "."
              : ""),
          "is-err"
        );
        button.disabled = true;
      } else if (notPersistent) {
        say(
          "Local development store — records go to .data/store.json and are " +
          "not shared with any deployment.",
          "is-info"
        );
      } else if (data.storage && data.storage.connectionSource) {
        say("Storage connected via " + data.storage.connectionSource + ".", "is-ok");
      }
    })
    .catch(function () {
      checking.hidden = true;
      setupPanel.hidden = false;
      say(
        "Could not confirm whether setup is still open. If you are previewing locally, " +
        "start the site with npm run dev.",
        "is-err"
      );
    });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!email) { say("Enter an administrator email address.", "is-err"); return; }
    if (password.length < 12) {
      say("The password must be at least 12 characters.", "is-err");
      return;
    }
    if (password !== confirmPassword) {
      say("The two passwords do not match.", "is-err");
      return;
    }

    button.disabled = true;
    button.textContent = "Creating\u2026";
    say("");

    fetch("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        password: password,
        confirmPassword: confirmPassword
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          form.reset();
          say(result.data.message + " Redirecting to sign in\u2026", "is-ok");
          setTimeout(function () {
            window.location.replace("admin-login.html");
          }, 1600);
          return;
        }
        if (result.status === 409) {
          showClosed(result.data.error);
          return;
        }
        if (result.status === 503) {
          const st = result.data.storage || {};
          const found = (st.variablesFound || []).join(", ");
          say(
            "The account could not be saved because storage is unreachable. " +
              (st.warning ? st.warning + " " : "") +
              (st.connectionSource
                ? "Credentials were read from " + st.connectionSource + "."
                : found
                  ? "Variables visible: " + found + "."
                  : "No Redis variables are visible to this deployment.") +
              " Full detail is in the Vercel function logs.",
            "is-err"
          );
          return;
        }
        say(result.data.error || "The account could not be created.", "is-err");
      })
      .catch(function () {
        say("Could not reach the account service. Try again shortly.", "is-err");
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Create administrator account";
      });
  });
})();
