import { AuthEmailCallback } from "./auth-email-callback";
import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  PublicSite,
  PublicDemo,
  AuthPage,
  LegalPage,
  SharedQuote,
  SharedCatalog,
  Invitation,
} from "./public";
import { Loading, NavigationSafety } from "./ui";
const Workspace = lazy(() =>
  import("./workspace").then((m) => ({ default: m.Workspace })),
);
import "./style.css";
import "./public-design.css";
import { api } from "./api";
void api("/config")
  .then((c) => {
    if (/^#[0-9a-f]{6}$/i.test(c.color))
      document.documentElement.style.setProperty("--primary", c.color);
    document.title = `${c.name} · Gestão para pequenos negócios`;
  })
  .catch(() => {});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<PublicSite />} />
          <Route path="/entrar" element={<AuthPage />} />
          <Route path="/cadastro" element={<AuthPage signup />} />
          <Route path="/recuperar" element={<AuthPage recovery />} />
          <Route path="/redefinir-senha" element={<AuthPage reset />} />
          <Route
            path="/confirmar-email/:ticket"
            element={<AuthEmailCallback />}
          />
          <Route path="/app/*" element={<Workspace />} />
          <Route path="/demonstracao" element={<PublicDemo />} />
          <Route path="/proposta/:token" element={<SharedQuote />} />
          <Route path="/catalogo-publico/:token" element={<SharedCatalog />} />
          <Route path="/convite/:token" element={<Invitation />} />
          <Route path="/:page" element={<LegalPage />} />
          <Route path="*" element={<LegalPage />} />
        </Routes>
      </Suspense>
      <NavigationSafety />
      <CookieChoice />
    </BrowserRouter>
  </React.StrictMode>,
);
function CookieChoice() {
  const [value, setValue] = React.useState(() =>
    localStorage.getItem("impulsa.cookies"),
  );
  const [custom, setCustom] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(false);
  React.useEffect(() => {
    const show = () => setValue(null);
    window.addEventListener("cookies:open", show);
    return () => window.removeEventListener("cookies:open", show);
  }, []);
  function save(optional: boolean) {
    const v = JSON.stringify({
      version: 1,
      necessary: true,
      optional,
      date: new Date().toISOString(),
    });
    localStorage.setItem("impulsa.cookies", v);
    setValue(v);
  }
  return !value ? (
    <aside className="cookie-banner" aria-label="Preferências de cookies">
      <div>
        <strong>Sua escolha, com transparência.</strong>
        <p>
          Usamos cookies necessários para sessão e segurança. Nenhum pixel ou
          serviço opcional está ativo. <a href="/cookies">Saiba mais</a>.
        </p>
        {custom && (
          <label>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />{" "}
            Permitir opcionais, caso disponibilizados após nova informação
          </label>
        )}
      </div>
      <div className="cookie-actions">
        <button className="button secondary" onClick={() => save(false)}>
          Rejeitar opcionais
        </button>
        <button
          className="button secondary"
          onClick={() => (custom ? save(analytics) : setCustom(true))}
        >
          {custom ? "Salvar escolhas" : "Personalizar"}
        </button>
        <button className="button secondary" onClick={() => save(true)}>
          Aceitar opcionais
        </button>
      </div>
    </aside>
  ) : null;
}
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller)
            window.dispatchEvent(new Event("pwa:update"));
        });
      });
    });
  });
