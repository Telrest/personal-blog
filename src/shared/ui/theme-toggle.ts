import {
  saveTheme,
  THEME_KEY,
  themeFromPreference,
} from "../data/theme-storage";

const root = document.documentElement;
const buttons = document.querySelectorAll<HTMLButtonElement>(
  "[data-theme-toggle]",
);

function setTheme(theme: "dark" | "light") {
  root.dataset.theme = theme;
  const dark = theme === "dark";
  const label = dark ? "切换为浅色模式" : "切换为深色模式";
  for (const button of buttons) {
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(dark));
    if (button.hasAttribute("title")) button.title = label;
  }
}

setTheme(themeFromPreference(root.dataset.theme ?? null));
for (const button of buttons) {
  button.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    setTheme(next);
    saveTheme(next);
  });
}
window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) setTheme(themeFromPreference(event.newValue));
});
