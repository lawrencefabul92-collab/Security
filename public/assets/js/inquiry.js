/* =========================================================
   ENROLMENT / INQUIRY FORM

   The checks here are a courtesy so a visitor is told about a
   problem before the round trip. They are not the real
   validation: /api/inquiry validates every field again on the
   server and is the only thing that decides what is stored.
   ========================================================= */
(function () {
  "use strict";

  const form = document.getElementById("inquiry-form");
  if (!form) return;

  const status = document.getElementById("inquiry-status");
  const button = document.getElementById("inquiry-btn");
  const select = document.getElementById("courseId");

  const FIELDS = ["fullName", "email", "mobile", "courseId", "message"];

  /* ---------- Populate the course dropdown ---------- */
  if (select && window.STA_COURSES) {
    window.STA_COURSES
      .filter(function (c) { return c.status !== "INACTIVE"; })
      .forEach(function (course) {
        const option = document.createElement("option");
        option.value = course.courseId;
        option.textContent =
          course.courseTitle +
          (course.status === "COMING_SOON" ? " (coming soon)" : "");
        select.appendChild(option);
      });

    /* Preselect from ?course= so the Enrol button on a course page
       arrives with the right course already chosen. */
    const requested = new URLSearchParams(window.location.search).get("course");
    if (requested) {
      const match = Array.prototype.find.call(select.options, function (o) {
        return o.value === requested;
      });
      if (match) select.value = requested;
    }
  }

  function say(message, kind) {
    status.textContent = message || "";
    status.className = "form-status " + (kind || "is-ok");
  }

  function setFieldError(name, message) {
    const field = document.getElementById("f-" + name);
    const error = document.getElementById("e-" + name);
    if (field) field.classList.toggle("has-error", Boolean(message));
    if (error) error.textContent = message || "";
  }

  function clearErrors() {
    FIELDS.forEach(function (name) { setFieldError(name, ""); });
  }

  function value(name) {
    const el = document.getElementById(name);
    return el ? el.value.trim() : "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearErrors();
    say("");

    const payload = {
      fullName: value("fullName"),
      email: value("email"),
      mobile: value("mobile"),
      courseId: value("courseId"),
      message: value("message"),
      website: value("website")
    };

    let valid = true;
    if (payload.fullName.length < 2) {
      setFieldError("fullName", "Enter your full name.");
      valid = false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      setFieldError("email", "Enter a valid email address.");
      valid = false;
    }
    const digits = payload.mobile.replace(/[^\d]/g, "");
    if (digits.length < 7 || digits.length > 15) {
      setFieldError("mobile", "Enter a mobile number we can reach you on.");
      valid = false;
    }
    if (!valid) {
      const first = document.querySelector(
        ".field.has-error input, .field.has-error select, .field.has-error textarea"
      );
      if (first) first.focus();
      say("Please check the highlighted fields.", "is-err");
      return;
    }

    button.disabled = true;
    button.textContent = "Sending\u2026";

    fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          if (result.data.fields) {
            Object.keys(result.data.fields).forEach(function (name) {
              setFieldError(name, result.data.fields[name]);
            });
          }
          say(result.data.error || "Your inquiry could not be sent.", "is-err");
          return;
        }
        form.reset();
        clearErrors();
        say(
          result.data.message +
            (result.data.reference
              ? " Your reference is " + result.data.reference + "."
              : ""),
          "is-ok"
        );
        status.scrollIntoView({ behavior: "smooth", block: "nearest" });
      })
      .catch(function () {
        say(
          "We could not reach the inquiry service. Check your connection and try again.",
          "is-err"
        );
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Send inquiry";
      });
  });
})();
