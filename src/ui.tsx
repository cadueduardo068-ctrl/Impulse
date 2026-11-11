import * as Dialog from "@radix-ui/react-dialog";
import { X, LoaderCircle, ArrowUpRight, Plus } from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type FormEvent,
  createContext,
  useContext,
} from "react";
const ValidationContext = createContext<Record<string, string>>({});
export function FormValidation({
  errors,
  children,
}: {
  errors: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <ValidationContext.Provider value={errors}>
      {children}
    </ValidationContext.Provider>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-top">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Fechar">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Preencha os campos e confirme a ação.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const errors = useContext(ValidationContext);
  const child = isValidElement(children)
    ? (children as ReactElement<{ name?: string; required?: boolean }>)
    : null;
  const issue =
    error ?? (child?.props.name ? errors[child.props.name] : undefined);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {child?.props.required && (
          <span className="required-mark" aria-label="obrigatório">
            {" "}
            *
          </span>
        )}
      </label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
              "aria-label"?: string;
            }>,
            {
              id,
              "aria-label": label,
              "aria-describedby": issue
                ? `${id}-error`
                : hint
                  ? `${id}-hint`
                  : undefined,
              ...(issue ? { "aria-invalid": true } : {}),
            },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {issue && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {issue}
        </small>
      )}
    </div>
  );
}
export function Submit({
  children = "Salvar",
  busy = false,
}: {
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <button className="button primary" disabled={busy} type="submit">
      {busy ? <LoaderCircle size={17} className="spin" /> : null}
      {children}
    </button>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Plus size={23} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button secondary" onClick={action}>
          Começar agora <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Carregando seus dados…
    </div>
  );
}
export function useAction() {
  const submitting = useRef(false),
    running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function failed(e: any) {
    setError(e.message);
    setFieldErrors(
      e.fieldErrors ??
        (e.issues
          ? Object.fromEntries(
              e.issues.map((i: any) => [i.path.join("."), i.message]),
            )
          : {}),
    );
  }
  return {
    busy,
    error,
    fieldErrors,
    clear: () => {
      setError("");
      setFieldErrors({});
    },
    run: async (fn: () => Promise<unknown>) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError("");
      setFieldErrors({});
      try {
        await fn();
      } catch (e) {
        failed(e);
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    onSubmit:
      (fn: (data: FormData) => Promise<unknown>) =>
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        const form = e.currentTarget;
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        setFieldErrors({});
        void Promise.resolve()
          .then(() => fn(data))
          .then(() => {
            form.dataset.dirty = "false";
          })
          .catch(failed)
          .finally(() => {
            submitting.current = false;
            setBusy(false);
          });
      },
  };
}
export function NavigationSafety() {
  useEffect(() => {
    const input = (e: Event) => {
      const form = (e.target as HTMLElement)?.closest("form");
      if (form) form.dataset.dirty = "true";
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (document.querySelector('form[data-dirty="true"]')) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("input", input);
    document.addEventListener("change", input);
    window.addEventListener("beforeunload", leave);
    return () => {
      document.removeEventListener("input", input);
      document.removeEventListener("change", input);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  return null;
}
