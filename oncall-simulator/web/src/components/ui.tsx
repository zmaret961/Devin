import { createContext, useContext, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Step } from '../../../shared/types.ts';
import { STRATEGY_LABELS, type StrategyId } from '../../../shared/types.ts';
import { STRATEGY_COLOR, rel } from '../util.ts';
import { Bot, CheckCircle2, ChevronRight, FileCode2, GitPullRequest, NotebookPen, Siren, Sparkles, Terminal, TriangleAlert, Users } from 'lucide-react';

export type Selection = { type: 'incident' | 'child' | 'pr' | 'note'; id: string | number } | null;
export const SelectContext = createContext<(s: Selection) => void>(() => {});
export const useSelect = () => useContext(SelectContext);

export function Card({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="card-title flex items-center gap-2">{title}</h3>
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export const Chip = ({ cls, children, title }: { cls: string; children: ReactNode; title?: string }) => (
  <span className={`chip ${cls}`} title={title}>
    {children}
  </span>
);

export const StrategyChip = ({ s }: { s: StrategyId }) => <Chip cls={STRATEGY_COLOR[s]}>{STRATEGY_LABELS[s]}</Chip>;

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[120px] items-center justify-center px-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function DiffView({ diff, compact = false }: { diff: string; compact?: boolean }) {
  const lines = diff.split('\n');
  return (
    <pre className={`mono overflow-x-auto rounded-lg bg-black/40 text-[11.5px] leading-5 ring-1 ring-white/10 ${compact ? 'p-2' : 'p-3'}`}>
      {lines.map((l, i) => {
        const cls = l.startsWith('+++') || l.startsWith('---') ? 'text-slate-400' : l.startsWith('+') ? 'bg-emerald-500/10 text-emerald-200' : l.startsWith('-') ? 'bg-rose-500/10 text-rose-200' : l.startsWith('@@') ? 'text-violet-300' : l.startsWith('diff ') || l.startsWith('index ') ? 'text-slate-500' : 'text-slate-400';
        return (
          <div key={i} className={`${cls} -mx-3 px-3 whitespace-pre`}>
            {l || ' '}
          </div>
        );
      })}
    </pre>
  );
}

const STEP_ICON: Record<Step['kind'], ReactNode> = {
  think: <Sparkles className="h-3.5 w-3.5 text-violet-300" />,
  tool: <Terminal className="h-3.5 w-3.5 text-slate-400" />,
  result: <ChevronRight className="h-3.5 w-3.5 text-slate-500" />,
  scratchpad: <Users className="h-3.5 w-3.5 text-sky-300" />,
  decision: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />,
  error: <TriangleAlert className="h-3.5 w-3.5 text-rose-300" />,
};

export function StepList({ steps, start, limit, showCode = true, compact = false }: { steps: Step[]; start: number; limit?: number; showCode?: boolean; compact?: boolean }) {
  const shown = limit ? steps.slice(-limit) : steps;
  return (
    <ol className="space-y-1.5">
      {shown.map((s, i) => (
        <li key={i} className="animate-fade-in">
          <div className="flex gap-2 text-[12px] leading-5">
            <span className="mt-0.5 shrink-0">{STEP_ICON[s.kind]}</span>
            {!compact && <span className="mono w-12 shrink-0 text-[10.5px] leading-5 text-slate-600">{rel(s.t, start)}</span>}
            <span className={`min-w-0 ${compact ? 'line-clamp-2 break-words text-[11.5px] leading-[17px]' : ''} ${s.kind === 'decision' ? 'font-medium text-emerald-200' : s.kind === 'think' ? 'text-slate-200' : s.kind === 'scratchpad' ? 'text-sky-200' : s.kind === 'error' ? 'text-rose-200' : 'text-slate-400'}`}>
              {s.tool && <span className="mono mr-1.5 rounded bg-white/[0.06] px-1 py-px text-[10.5px] text-slate-300">{s.tool}</span>}
              <InlineCode text={s.text} />
            </span>
          </div>
          {showCode && s.code && (
            <pre className="mono mb-1 ml-[76px] mt-1 max-h-48 overflow-auto rounded-md bg-black/40 p-2 text-[11px] leading-[18px] text-slate-300 ring-1 ring-white/[0.06]">
              {s.code.split('\n').map((l, j) => (
                <div key={j} className={l.startsWith('+ ') || (l.startsWith('+') && !l.startsWith('+++')) ? 'text-emerald-300' : l.startsWith('- ') || (l.startsWith('-') && !l.startsWith('---')) ? 'text-rose-300' : l.includes('✖') ? 'text-rose-300' : l.includes('✔') ? 'text-emerald-300' : ''}>
                  {l || ' '}
                </div>
              ))}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}

export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="mono rounded bg-white/[0.06] px-1 text-[11px] text-violet-200">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p.replace(/\*\*/g, '')}</span>
        ),
      )}
    </>
  );
}

export const ActionIcon = ({ action }: { action?: string }) =>
  action === 'pr' || action === 'joined' ? <GitPullRequest className="h-3.5 w-3.5 text-emerald-300" /> : action === 'note' ? <NotebookPen className="h-3.5 w-3.5 text-sky-300" /> : action === 'escalate' ? <Siren className="h-3.5 w-3.5 text-rose-300" /> : action === 'auto-resolved' ? <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" /> : <Bot className="h-3.5 w-3.5 text-violet-300" />;

export const FileIcon = FileCode2;
