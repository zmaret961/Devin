import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-muted">{eyebrow}</p>}
        <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="mt-1 text-ink-2">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[0.8125rem] font-semibold tracking-[0.06em] text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}
