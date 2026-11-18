export const THEME_KEY = "telrest-theme-v2";
export type Theme = "light" | "dark";

export function themeFromPreference(value: string | null): Theme {
  return value === "light" ? "light" : "dark";
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
