import { Mail } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { Logo } from "./public";
import { ErrorBox, useAction } from "./ui";
import "./email-pending.css";

export function AuthEmailCallback() {
  const { ticket } = useParams();
  const [query] = useSearchParams();
  const code = query.get("code");
  const flowId = query.get("sb_flow_id") ?? undefined;
  const action = useAction();

  return (
    <main className="email-gate">
      <header className="email-gate-header">
        <Logo />
      </header>
      <section className="panel email-card" aria-labelledby="email-link-title">
        <div className="email-card-icon">
          <Mail size={25} aria-hidden="true" />
        </div>
        <h1 id="email-link-title">Continuar com meu e-mail</h1>
        {code && ticket ? (
          <>
            <p>
              Use o botão para concluir a confirmação ou seguir para a troca de
              senha que você solicitou.
            </p>
            <div className="email-actions">
              <button
                className="button primary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const { redirect } = await api(
                      "/auth-mail/redeem",
                      "POST",
                      { ticket, code, flowId },
                    );
                    window.location.replace(redirect);
                  })
                }
              >
                {action.busy ? "Validando link…" : "Continuar"}
              </button>
            </div>
            <ErrorBox message={action.error} />
          </>
        ) : (
          <ErrorBox message="Link inválido, expirado ou já utilizado. Solicite outro pelo Impulsa." />
        )}
        <footer className="email-card-footer">
          <Link className="link-button" to="/entrar">
            Ir para a entrada
          </Link>
          <Link className="link-button" to="/recuperar">
            Recuperar senha
          </Link>
        </footer>
      </section>
    </main>
  );
}
