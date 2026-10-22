import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'block w-full min-h-12 rounded-xl border border-line-strong bg-white px-3.5 text-base text-ink placeholder:text-muted/70 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/25 aria-[invalid=true]:border-brick';

interface Wrap {
  label: string;
  hint?: string;
  error?: string | null;
}

function Shell({ id, label, hint, error, children }: Wrap & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-brick">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, hint, error, ...props }: Wrap & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...props}
      />
    </Shell>
  );
}

export function SelectField({ label, hint, error, children, ...props }: Wrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select id={id} className={`${control} appearance-auto`} aria-invalid={error ? true : undefined} {...props}>
        {children}
      </select>
    </Shell>
  );
}

export function TextAreaField({ label, hint, error, ...props }: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} rows={3} className={`${control} py-3`} aria-invalid={error ? true : undefined} {...props} />
    </Shell>
  );
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`interactive inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-pine px-5 font-semibold text-white hover:bg-pine-dark disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`interactive inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-5 font-semibold text-ink disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
