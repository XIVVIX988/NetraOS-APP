// Apply a saved dark theme before stylesheets render to avoid a light-theme flash.
(() => {
  try {
    const themeSettings = JSON.parse(localStorage.getItem("netraos-settings-v1") || "{}");
    const dark = themeSettings.themeMode === "dark"
      || (themeSettings.themeMode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.dataset.themeStart = "dark";
  } catch { /* Use the default theme when storage is unavailable. */ }
})();
