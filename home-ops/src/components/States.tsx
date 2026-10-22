import type { ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

export function LoadingState({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16" aria-hidden />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex items-start gap-3 p-4">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-brick" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="interactive mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold"
          >
            <RotateCw className="size-4" aria-hidden /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Subtle prompt shown in place of a missing value (model number, phone, address). */
export function AddInfoButton({ onClick, label, className = '' }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={`inline-flex min-h-8 items-center rounded-md text-sm text-muted underline decoration-dotted decoration-1 underline-offset-4 hover:text-pine ${className}`}
    >
      Click to add info
    </button>
  );
}
