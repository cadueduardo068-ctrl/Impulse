import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    function followDevice() {
      try {
        if (localStorage.getItem("impulsa-theme")) return;
      } catch {
        return;
      }
      const next = preference.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }
    preference.addEventListener("change", followDevice);
    return () => preference.removeEventListener("change", followDevice);
  }, []);

  const dark = theme === "dark";
  const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem("impulsa-theme", next);
        } catch {
          // O tema ainda funciona nesta página.
        }
      }}
    >
      {dark ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}
