"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div
        className="theme-toggle-container skeleton"
        style={{ width: "120px", height: "40px", borderRadius: "20px" }}
      />
    );
  }

  return (
    <div className="theme-toggle-container">
      <button
        onClick={() => setTheme("light")}
        className={`theme-toggle-btn ${theme === "light" ? "active" : ""}`}
        aria-label="Light mode"
      >
        <Sun size={18} />
        <span className="sr-only">Light</span>
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`theme-toggle-btn ${theme === "system" ? "active" : ""}`}
        aria-label="System mode"
      >
        <Monitor size={18} />
        <span className="sr-only">System</span>
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`theme-toggle-btn ${theme === "dark" ? "active" : ""}`}
        aria-label="Dark mode"
      >
        <Moon size={18} />
        <span className="sr-only">Dark</span>
      </button>
    </div>
  );
}
