(function () {
  const KEY = "launchpad-theme";

  function apply(theme) {
    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  // Runs synchronously before first paint (this script is loaded first, in <head>)
  // to avoid a flash of the wrong theme.
  apply(localStorage.getItem(KEY) || "dark");

  function updateToggleIcon() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const isLight = (localStorage.getItem(KEY) || "dark") === "light";
    btn.title = isLight ? "Switch to dark theme" : "Switch to light theme";
  }

  window.toggleTheme = function () {
    const current = localStorage.getItem(KEY) || "dark";
    const next = current === "light" ? "dark" : "light";
    localStorage.setItem(KEY, next);
    apply(next);
    updateToggleIcon();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", window.toggleTheme);
      updateToggleIcon();
    }
  });
})();
