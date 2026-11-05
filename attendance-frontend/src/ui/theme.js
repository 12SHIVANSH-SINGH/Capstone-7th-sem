const STORAGE_KEY = "bioattend.theme";
const DARK_THEME_COLOR = "#0b1120";
const LIGHT_THEME_COLOR = "#4F46E5";

export const readTheme = () => {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.dataset.theme === "dark") return "dark";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    return "light";
  }
};

export const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    // Private browsing can reject storage; the current page still switches.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
};
