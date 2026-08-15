/* =========================================================
   SHARED CHROME — used by every public page.
   Mobile navigation, footer year, footer course links.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Footer course links ---------- */
  const footerCourses = document.getElementById("footer-courses");
  if (footerCourses && window.STA_COURSES) {
    footerCourses.innerHTML = window.STA_COURSES
      .filter(function (c) { return c.status !== "INACTIVE"; })
      .slice(0, 6)
      .map(function (c) {
        return (
          '<li><a href="course.html?id=' +
          encodeURIComponent(c.courseId) +
          '">' +
          c.courseTitle
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;") +
          "</a></li>"
        );
      })
      .join("");
  }

  /* ---------- Mobile navigation ---------- */
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");
  if (!burger || !nav) return;

  function setNav(open) {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  burger.addEventListener("click", function () {
    setNav(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) setNav(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setNav(false);
      burger.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 940) setNav(false);
  });
})();
