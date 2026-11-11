import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
export function Calendar({
  records,
  onCreate,
  onSelect,
}: {
  records: any[];
  onCreate: (date: string) => void;
  onSelect: (record: any) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const key = (n: number) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  return (
    <section className="panel calendar-panel">
      <div className="calendar-heading">
        <h2>
          {new Intl.DateTimeFormat("pt-BR", {
            month: "long",
            year: "numeric",
          }).format(month)}
        </h2>
        <div>
          <button
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="button secondary compact"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Hoje
          </button>
          <button
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
          <span className="calendar-weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div className="calendar-day muted" key={`blank-${i}`} />
        ))}
        {Array.from({ length: last }, (_, i) => i + 1).map((day) => (
          <div
            className={`calendar-day ${key(day) === new Date().toISOString().slice(0, 10) ? "today" : ""}`}
            key={day}
          >
            <button
              className="calendar-number"
              onClick={() => onCreate(key(day))}
              aria-label={`Agendar em ${day}`}
            >
              <span>{day}</span>
              <Plus size={12} />
            </button>
            {records
              .filter((r) => r.data.due === key(day))
              .map((r) => (
                <button
                  className={`calendar-event ${r.data.status === "done" ? "done" : ""}`}
                  key={r.id}
                  onClick={() => onSelect(r)}
                >
                  {r.data.startTime && <strong>{r.data.startTime} </strong>}
                  {r.data.name}
                </button>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
