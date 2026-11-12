import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  LayoutGrid,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { money } from "../shared/domain";

const views = [
  { label: "Visão geral", icon: LayoutGrid },
  { label: "Orçamentos", icon: FileText },
  { label: "Financeiro", icon: Wallet },
] as const;
const quote = 120000;
const installment = 68000;
const week = [52, 79, 65, 88, 75, 94, 100];

export function DemoPanel({ preview = false }: { preview?: boolean }) {
  const [view, setView] = useState(0);
  const [approved, setApproved] = useState(false);
  const [received, setReceived] = useState(false);
  const [feedback, setFeedback] = useState("");
  const balance = 486000 + (received ? installment : 0);
  const pending =
    212000 + (approved ? quote : 0) - (received ? installment : 0);
  return (
    <section
      className="sample-panel"
      aria-label="Painel da Marcenaria Horizonte"
    >
      <div className="sample-top">
        <div className="sample-company">
          <span aria-hidden="true">H</span>
          <div>
            <strong>Marcenaria Horizonte</strong>
            <small>Dados fictícios</small>
          </div>
        </div>
        {!preview && (
          <button
            type="button"
            className="sample-reset"
            onClick={() => {
              setView(0);
              setApproved(false);
              setReceived(false);
              setFeedback("Os dados de exemplo foram restaurados.");
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> Reiniciar
          </button>
        )}
      </div>
      <div
        className="sample-nav"
        role="group"
        aria-label="Áreas da demonstração"
      >
        {views.map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={index === view}
            onClick={() => setView(index)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="sample-content">
        {view === 0 && (
          <>
            <div className="sample-heading">
              <h2>Resumo do negócio</h2>
              <span>Esta semana</span>
            </div>
            <div className="sample-kpis">
              <div>
                <span>Recebido</span>
                <strong>{money(balance)}</strong>
              </div>
              <div>
                <span>A receber</span>
                <strong>{money(pending)}</strong>
              </div>
              <div>
                <span>Orçamentos abertos</span>
                <strong>{approved ? 3 : 4}</strong>
              </div>
            </div>
            <div className="sample-chart">
              <div>
                <strong>Entradas da semana</strong>
                <span>
                  <ArrowUpRight size={14} aria-hidden="true" /> {money(balance)}
                </span>
              </div>
              <div className="sample-bars" aria-hidden="true">
                {week.map((height, i) => (
                  <div key={i}>
                    <i style={{ height: `${height}%` }} />
                    <small>
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {view === 1 && (
          <>
            <h2>Orçamentos</h2>
            <div className="sample-entry">
              <div>
                <strong>Armário sob medida</strong>
                <small>Ana Ribeiro · Proposta #014</small>
              </div>
              <div>
                <strong>{money(quote)}</strong>
                <small>{approved ? "Aprovado" : "Aguardando aprovação"}</small>
              </div>
            </div>
            {!preview && (
              <button
                className="button primary"
                type="button"
                disabled={approved}
                onClick={() => {
                  setApproved(true);
                  setFeedback(
                    "Orçamento aprovado. O valor entrou em contas a receber.",
                  );
                }}
              >
                Simular aprovação <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        {view === 2 && (
          <>
            <h2>Contas a receber</h2>
            <div className="sample-entry">
              <div>
                <strong>Instalação de prateleiras</strong>
                <small>Rafael Martins</small>
              </div>
              <div>
                <strong>{money(installment)}</strong>
                <small>{received ? "Recebido" : "Pendente"}</small>
              </div>
            </div>
            {approved && (
              <div className="sample-entry">
                <div>
                  <strong>Armário sob medida</strong>
                  <small>Ana Ribeiro</small>
                </div>
                <div>
                  <strong>{money(quote)}</strong>
                  <small>Pendente</small>
                </div>
              </div>
            )}
            {!preview && (
              <button
                className="button primary"
                type="button"
                disabled={received}
                onClick={() => {
                  setReceived(true);
                  setFeedback(
                    "Recebimento registrado. Os totais do painel foram atualizados.",
                  );
                }}
              >
                Simular recebimento{" "}
                <ArrowDownLeft size={16} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        {!preview && (
          <p className="sample-feedback" role="status">
            {feedback}
          </p>
        )}
      </div>
    </section>
  );
}
