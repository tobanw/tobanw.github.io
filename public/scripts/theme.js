(function () {
  var storageKey = "theme";
  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");
  var icon = document.querySelector("[data-theme-icon]");
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var moonPath = "M21 14.4A7.8 7.8 0 0 1 9.6 3 8.6 8.6 0 1 0 21 14.4Z";
  var sunPath = "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z";

  function getStoredTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      return;
    }
  }

  function preferredTheme() {
    return getStoredTheme() || (media.matches ? "dark" : "light");
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (!toggle) return;
    var isDark = theme === "dark";
    if (icon) icon.setAttribute("d", isDark ? sunPath : moonPath);
    toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    toggle.setAttribute("aria-pressed", String(isDark));
  }

  applyTheme(preferredTheme());

  window.toggleTheme = function () {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next);
  };

  if (toggle) {
    toggle.addEventListener("click", function () {
      window.toggleTheme();
    });
  }

  media.addEventListener("change", function () {
    if (!getStoredTheme()) applyTheme(preferredTheme());
  });
})();
