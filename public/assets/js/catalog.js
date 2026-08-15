/* =========================================================
   COURSE CARDS AND CATALOGUE FILTERING

   Reads window.STA_COURSES, which is generated from
   lib/courses.js. Adding a course to that file makes it
   appear here, on the catalogue page, in the footer, in the
   inquiry dropdown and in the certificate generator, with no
   other change anywhere.
   ========================================================= */
(function (global) {
  "use strict";

  const esc = function (value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  const peso = function (amount) {
    return "\u20B1" + Number(amount).toLocaleString("en-PH");
  };

  const ACCENTS = { navy: "navy", blue: "blue", gold: "gold", red: "red" };

  function cardHtml(course) {
    const soon = course.status === "COMING_SOON";
    const accent = ACCENTS[course.accent] || "navy";
    const href = "course.html?id=" + encodeURIComponent(course.courseId);

    return (
      '<article class="course reveal">' +
        '<div class="course__plate course__plate--' + accent + '">' +
          '<p class="course__cat">' + esc(course.category) + "</p>" +
          (soon
            ? '<span class="course__badge course__badge--soon">Coming soon</span>'
            : '<span class="course__badge">' + esc(course.level) + "</span>") +
        "</div>" +

        '<div class="course__body">' +
          "<h3>" + esc(course.courseTitle) + "</h3>" +
          '<p class="course__desc">' + esc(course.summary) + "</p>" +
          '<div class="course__meta">' +
            '<span class="chip">' + esc(course.duration) + "</span>" +
            '<span class="chip">' + esc(course.level) + "</span>" +
            (course.certificateEligible
              ? '<span class="chip">Certificate</span>'
              : "") +
          "</div>" +
          '<div class="course__price">' +
            '<span class="amount">' + peso(course.price) + "</span>" +
            '<span class="note">Full course fee</span>' +
          "</div>" +
        "</div>" +

        '<div class="course__actions">' +
          '<a class="btn btn--ghost btn--sm" href="' + href + '">View course</a>' +
          (soon
            ? '<a class="btn btn--ghost btn--sm" href="index.html#enrol">Register interest</a>'
            : '<a class="btn btn--gold btn--sm" href="' + href + '#enrol">Enrol</a>') +
        "</div>" +
      "</article>"
    );
  }

  function visibleCourses() {
    return (global.STA_COURSES || []).filter(function (c) {
      return c.status !== "INACTIVE";
    });
  }

  function renderGrid(grid, courses) {
    if (!grid) return;
    if (!courses.length) {
      grid.innerHTML =
        '<p style="color:var(--muted)">No courses match that filter.</p>';
      return;
    }
    grid.innerHTML = courses.map(cardHtml).join("");

    /* Hand the new cards to the reveal observer. If that module has not
       loaded, show them immediately rather than leaving them at the
       .reveal starting opacity of zero — an invisible course card is a
       far worse failure than a missing animation. */
    if (global.STAReveal) {
      global.STAReveal.watch(grid);
    } else {
      grid.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("is-in");
      });
    }
  }

  /* ---------- Grid on any page carrying #courses-grid ---------- */
  const grid = document.getElementById("courses-grid");
  if (grid) {
    const limit = parseInt(grid.getAttribute("data-limit"), 10);
    const courses = visibleCourses();
    renderGrid(grid, limit > 0 ? courses.slice(0, limit) : courses);
  }

  /* ---------- Category filters (catalogue page only) ---------- */
  const filters = document.getElementById("course-filters");
  if (filters && grid) {
    const courses = visibleCourses();
    const categories = [];
    courses.forEach(function (c) {
      if (categories.indexOf(c.category) === -1) categories.push(c.category);
    });

    filters.innerHTML =
      '<button class="filter is-active" type="button" data-filter="ALL">All courses</button>' +
      categories
        .map(function (category) {
          return (
            '<button class="filter" type="button" data-filter="' +
            esc(category) + '">' + esc(category) + "</button>"
          );
        })
        .join("");

    filters.addEventListener("click", function (event) {
      const button = event.target.closest("[data-filter]");
      if (!button) return;

      filters.querySelectorAll(".filter").forEach(function (el) {
        el.classList.toggle("is-active", el === button);
      });

      const value = button.getAttribute("data-filter");
      renderGrid(
        grid,
        value === "ALL"
          ? courses
          : courses.filter(function (c) { return c.category === value; })
      );
    });
  }

  /* ---------- Course counter used on the home page strip ---------- */
  const counter = document.getElementById("stat-courses");
  if (counter) {
    counter.textContent = String(
      (global.STA_COURSES || []).filter(function (c) {
        return c.status === "ACTIVE";
      }).length
    );
  }

  global.STACatalog = {
    escape: esc,
    peso: peso,
    cardHtml: cardHtml,
    visibleCourses: visibleCourses
  };
})(window);
