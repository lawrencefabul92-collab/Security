/* =========================================================
   COURSE DETAIL PAGE

   Reads ?id= from the URL and fills the page from the course
   catalogue.

   The address is course.html?id=... rather than a nested
   /courses/:id path. A nested path would change what a relative
   asset path resolves against, which would break every
   stylesheet and script on this page the moment it is opened
   from disk rather than through a server.
   ========================================================= */
(function () {
  "use strict";

  const esc = window.STACatalog.escape;
  const peso = window.STACatalog.peso;

  function requestedId() {
    return new URLSearchParams(window.location.search).get("id") || "";
  }

  function list(target, items) {
    const el = document.getElementById(target);
    if (!el) return;
    el.innerHTML = (items || [])
      .map(function (item) { return "<li>" + esc(item) + "</li>"; })
      .join("");
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  const id = requestedId();
  const course = (window.STA_COURSES || []).find(function (c) {
    return c.courseId === id && c.status !== "INACTIVE";
  });

  if (!course) {
    document.getElementById("not-found").hidden = false;
    document.getElementById("enrol").hidden = true;
    text("course-title", "Course not found");
    text("crumb-title", "Not found");
    document.title = "Course not found | Security Training Academy";
    return;
  }

  /* ---------- Head and metadata ---------- */
  document.title = course.courseTitle + " | Security Training Academy";

  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", course.summary);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    ogTitle.setAttribute(
      "content",
      course.courseTitle + " | Security Training Academy"
    );
  }
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute("content", course.summary);

  /* ---------- Hero ---------- */
  const category = document.getElementById("course-category");
  category.textContent = course.category;
  category.hidden = false;

  text("crumb-title", course.courseTitle);
  text("course-title", course.courseTitle);
  text("course-summary", course.summary);

  /* ---------- Body ---------- */
  document.getElementById("course-body").hidden = false;
  document.getElementById("cert-info").hidden = false;

  text("course-description", course.description);
  list("course-objectives", course.learningObjectives);
  list("course-modules", course.modules);
  list("course-audience", course.audience);
  list("course-outcomes", course.outcomes);
  list("course-requirements", course.requirements);
  list("course-benefits", course.benefits);

  /* ---------- Sidebar ---------- */
  text("course-price", peso(course.price));
  text("course-duration", course.duration);
  text("course-level", course.level);
  text("course-format", course.format);
  text(
    "course-certificate",
    course.certificateEligible
      ? "Certificate of Completion"
      : "Not yet available"
  );

  /* ---------- Coming soon ---------- */
  const cta = document.getElementById("enrol-cta");
  if (course.status === "COMING_SOON") {
    cta.textContent = "Register interest";

    const notice = document.createElement("div");
    notice.className = "notice notice--warn";
    notice.style.marginTop = "1.4rem";
    notice.innerHTML =
      "<p><strong>This course is not open yet.</strong> Send an inquiry and we will " +
      "tell you as soon as enrolment opens. No certificate is issued for this course " +
      "at present.</p>";
    cta.parentElement.insertAdjacentElement("afterend", notice);
  }

  /* ---------- Preselect the course in the inquiry form ---------- */
  window.addEventListener("DOMContentLoaded", preselect);
  preselect();

  function preselect() {
    const select = document.getElementById("courseId");
    if (!select || !select.options.length) return;
    const match = Array.prototype.find.call(select.options, function (option) {
      return option.value === course.courseId;
    });
    if (match) select.value = course.courseId;
  }
})();
