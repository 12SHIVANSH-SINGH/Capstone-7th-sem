import React, { useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import { applyTheme, readTheme } from "./theme";

// Shared theme switch for the app shell and the public/lab pages. The early
// script in public/index.html applies the stored choice before React paints.
const ThemeToggle = ({ className = "ui-icon-btn" }) => {
  const [theme, setTheme] = useState(readTheme);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={theme === "dark" ? "Use light theme" : "Use dark theme"}
      aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
    >
      {theme === "dark" ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
    </button>
  );
};

export default ThemeToggle;
