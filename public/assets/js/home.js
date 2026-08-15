/* =========================================================
   HOME PAGE BEHAVIOUR
   FAQ accordion, scroll reveal, active navigation link.
   ========================================================= */
(function (global) {
  "use strict";

  /* ---------- Scroll reveal ---------- */
  let observer = null;

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
  }

  function watch(root) {
    const elements = (root || document).querySelectorAll(".reveal:not(.is-in)");
    if (!observer) {
      elements.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    elements.forEach(function (el) { observer.observe(el); });
  }

  global.STAReveal = { watch: watch };
  watch(document);

  /* Last-resort safety net. If the observer never fires — an unusual
     browser, a stalled frame, an element the observer was handed after
     it was already on screen — anything still at zero opacity is
     revealed. A missing animation is a trivial problem; a permanently
     invisible course card is not. */
  window.setTimeout(function () {
    document.querySelectorAll(".reveal:not(.is-in)").forEach(function (el) {
      const box = el.getBoundingClientRect();
      const inView = box.top < window.innerHeight && box.bottom > 0;
      if (inView) el.classList.add("is-in");
    });
  }, 2500);

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq__q").forEach(function (button) {
    button.addEventListener("click", function () {
      const isOpen = button.getAttribute("aria-expanded") === "true";

      document.querySelectorAll(".faq__q").forEach(function (other) {
        other.setAttribute("aria-expanded", "false");
        const panel = document.getElementById(other.getAttribute("aria-controls"));
        if (panel) panel.classList.remove("is-open");
      });

      if (!isOpen) {
        button.setAttribute("aria-expanded", "true");
        const panel = document.getElementById(button.getAttribute("aria-controls"));
        if (panel) panel.classList.add("is-open");
      }
    });
  });

  /* ---------- Active navigation link on scroll ---------- */
  const sections = ["home", "courses", "how", "about", "faq"]
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  const navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav a[href*="#"]')
  );

  if (sections.length && navLinks.length && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            const target = link.getAttribute("href").split("#")[1];
            link.classList.toggle("is-active", target === entry.target.id);
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (section) { spy.observe(section); });
  }
})(window);
