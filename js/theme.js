import { initNearMeLookup } from "./near-me.js";

export function setTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  localStorage.setItem("travel-helper-theme", theme);

  const themeLabel = document.querySelector("#themeLabel");
  if (themeLabel) {
    themeLabel.textContent = theme === "dark" ? "Light" : "Dark";
  }
}

export function initTheme() {
  setTheme(localStorage.getItem("travel-helper-theme") || "light");

  const themeToggle = document.querySelector("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      setTheme(root.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  initNearMeLookup();
}
