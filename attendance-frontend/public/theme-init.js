// Apply a stored dark choice before the first paint to avoid a light flash.
// Kept as an external file so the Content-Security-Policy can forbid inline
// scripts entirely.
(function () {
  try {
    if (window.localStorage.getItem("bioattend.theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#0b1120");
    }
  } catch (error) {
    // Storage can be unavailable in private or restricted contexts.
  }
})();
