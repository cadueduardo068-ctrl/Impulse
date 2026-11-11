import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { api, authClient } from "./api";
import { Logo } from "./public";
import { Field, ErrorBox, Submit, useAction } from "./ui";
import "./email-pending.css";

export function EmailPending({
  email,
  onRefresh,
  onEdit,
}: {
  email: string;
  onRefresh: () => void;
  onEdit: () => void;
}) {
  const a = useAction();
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [delivery, setDelivery] = useState<string | null>(null);
  const local = delivery === "development-capture";
  const localAddress = /\.local$/i.test(email);
  useEffect(() => {
    let active = true;
    void api("/email-status")
      .then((result) => {
        if (active) setDelivery(result.mode);
      })
      .catch(() => {
        if (active) setDelivery("unknown");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return (
    <main className="email-gate">
      <header className="email-gate-header">
        <Logo />
      </header>
      <section className="panel email-card" aria-labelledby="email-title">
        <div className="email-card-icon">
          <Mail size={25} aria-hidden="true" />
        </div>
        <h1 id="email-title">Confirme seu e-mail</h1>
        <p>
          Seu perfil está salvo. Confirme o endereço abaixo para acessar seu
          negócio.
        </p>
        <div className="email-recipient">
          <span>Endereço cadastrado</span>
          <strong>{email}</strong>
        </div>
        <div className="email-delivery">
          {local ? (
            <>
              <strong>Entrega por e-mail desativada</strong>
              <p>
                O Impulsa está em modo local. Os links de confirmação ficam na
                caixa de saída de teste do servidor.
              </p>
              {localAddress && (
                <p>
                  Para receber mensagens quando o envio for ativado, troque este
                  endereço por um e-mail que você usa.
                </p>
              )}
            </>
          ) : delivery === "smtp" && localAddress ? (
            <p>
              Endereços terminados em <strong>.local</strong> não recebem
              e-mails pela internet. Corrija o endereço para receber o link.
            </p>
          ) : delivery === "smtp" ? (
            <p>
              Confira a caixa de entrada e o spam. O link de confirmação vale
              por uma hora.
            </p>
          ) : delivery === "unknown" ? (
            <p>
              Não foi possível verificar se o envio está disponível. Atualize a
              página para tentar de novo.
            </p>
          ) : (
            <p>Verificando disponibilidade do envio…</p>
          )}
        </div>
        {new URLSearchParams(location.search).has("error") && (
          <ErrorBox message="Link inválido, expirado ou já utilizado. Solicite uma nova confirmação." />
        )}
        <div className="email-actions">
          <button
            className="button primary"
            disabled={
              a.busy ||
              seconds > 0 ||
              !delivery ||
              delivery === "unknown" ||
              (delivery === "smtp" && localAddress)
            }
            onClick={() =>
              void a.run(async () => {
                setStatus("");
                const r = await authClient.sendVerificationEmail({
                  email,
                  callbackURL: "/app",
                });
                if (r.error)
                  throw new Error(
                    r.error.message ??
                      "Não foi possível reenviar. Aguarde um minuto.",
                  );
                setSeconds(60);
                setStatus(
                  local
                    ? "Novo link salvo na caixa de saída local."
                    : "Reenvio solicitado. Confira sua caixa de entrada e o spam.",
                );
              })
            }
          >
            <RefreshCw size={16} aria-hidden="true" />
            {seconds ? `Aguarde ${seconds}s` : "Reenviar confirmação"}
          </button>
          <button className="button secondary" onClick={onRefresh}>
            Já confirmei · verificar
          </button>
        </div>
        <details className="email-correction" open={localAddress || undefined}>
          <summary>Corrigir endereço de e-mail</summary>
          <p>
            Informe sua senha para trocar o endereço e gerar um novo link de
            confirmação.
          </p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              setStatus("");
              const newEmail = String(f.get("newEmail")).trim();
              if (/\.local$/i.test(newEmail))
                throw new Error(
                  "Use um endereço que receba e-mails pela internet.",
                );
              await api("/email-reauth", "POST", {
                password: String(f.get("password")),
              });
              const r = await authClient.changeEmail({
                newEmail,
                callbackURL: "/app",
              });
              if (r.error)
                throw new Error(
                  r.error.message ?? "Não foi possível alterar o endereço.",
                );
              setSeconds(60);
              setStatus(
                local
                  ? "Endereço atualizado. O link está na caixa de saída local."
                  : "Endereço atualizado. Confira a nova confirmação.",
              );
              onRefresh();
            })}
          >
            <Field label="Novo e-mail">
              <input
                name="newEmail"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
            <Field label="Senha atual">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Submit busy={a.busy}>Corrigir e reenviar</Submit>
          </form>
        </details>
        <ErrorBox message={a.error} />
        {status && (
          <p role="status" className="email-feedback">
            {status}
          </p>
        )}
        <footer className="email-card-footer">
          <button className="link-button" onClick={onEdit}>
            Revisar meu perfil
          </button>
          <button
            className="link-button"
            onClick={() =>
              void authClient.signOut().then(() => location.assign("/entrar"))
            }
          >
            Sair da conta
          </button>
        </footer>
      </section>
    </main>
  );
}
