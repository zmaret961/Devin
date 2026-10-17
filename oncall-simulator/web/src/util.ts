import type { Alert, ChildAgent, Incident, Severity, StrategyId } from '../../shared/types.ts';

export const MIN = 60_000;

export const fmtMin = (m: number | null | undefined, digits = 1) => (m === null || m === undefined || Number.isNaN(m) ? '—' : `${m.toFixed(digits)}m`);
export const rel = (t: number, start: number) => `+${((t - start) / MIN).toFixed(1)}m`;
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const SEV: Record<Severity, string> = {
  P1: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  P2: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  P3: 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
  P4: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

export const SOURCE: Record<Alert['source'], { label: string; cls: string }> = {
  datadog: { label: 'Datadog', cls: 'bg-[#632ca6]/25 text-[#c9a6ff] ring-[#632ca6]/50' },
  sentry: { label: 'Sentry', cls: 'bg-[#362d59]/60 text-[#e1d7ff] ring-[#7f6ab8]/40' },
  pingdom: { label: 'Pingdom', cls: 'bg-amber-500/10 text-amber-200 ring-amber-500/30' },
  pagerduty: { label: 'PagerDuty', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
  zendesk: { label: 'Zendesk', cls: 'bg-teal-500/10 text-teal-200 ring-teal-500/30' },
  custom: { label: 'Injected', cls: 'bg-sky-500/10 text-sky-200 ring-sky-500/30' },
};

export const DISPOSITION: Record<Alert['disposition'], { label: string; cls: string }> = {
  pending: { label: 'triaging', cls: 'bg-white/5 text-slate-300 ring-white/10' },
  'new-incident': { label: 'new incident', cls: 'bg-violet-500/15 text-violet-200 ring-violet-500/30' },
  grouped: { label: 'grouped', cls: 'bg-sky-500/10 text-sky-200 ring-sky-500/25' },
  suppressed: { label: 'suppressed', cls: 'bg-slate-500/10 text-slate-400 ring-slate-500/25' },
  held: { label: 'held', cls: 'bg-amber-500/10 text-amber-200 ring-amber-500/25' },
  stopped: { label: 'stopped', cls: 'bg-slate-500/10 text-slate-400 ring-slate-500/25' },
};

export const INC_STATUS: Record<Incident['status'], { label: string; cls: string }> = {
  held: { label: 'Held', cls: 'bg-amber-500/10 text-amber-200 ring-amber-500/25' },
  queued: { label: 'Queued', cls: 'bg-white/5 text-slate-300 ring-white/10' },
  investigating: { label: 'Investigating', cls: 'bg-violet-500/15 text-violet-200 ring-violet-500/30' },
  fixing: { label: 'Fixing', cls: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-500/30' },
  'pr-open': { label: 'PR open', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  merged: { label: 'Merged', cls: 'bg-purple-500/20 text-purple-200 ring-purple-500/40' },
  noted: { label: 'Note left', cls: 'bg-sky-500/10 text-sky-200 ring-sky-500/25' },
  escalated: { label: 'Escalated', cls: 'bg-rose-500/15 text-rose-200 ring-rose-500/30' },
  'auto-resolved': { label: 'Self-resolved', cls: 'bg-slate-500/10 text-slate-300 ring-slate-500/25' },
  cancelled: { label: 'Closed', cls: 'bg-slate-500/10 text-slate-400 ring-slate-500/25' },
};

export const CHILD_STATUS: Record<ChildAgent['status'], string> = {
  queued: 'text-slate-400',
  running: 'text-violet-300',
  done: 'text-emerald-300',
  cancelled: 'text-slate-500',
  failed: 'text-rose-300',
};

export const STRATEGY_COLOR: Record<StrategyId, string> = {
  'keyword-grep': 'bg-slate-500/15 text-slate-200 ring-slate-400/25',
  'stack-trace-first': 'bg-cyan-500/10 text-cyan-200 ring-cyan-500/30',
  'recent-deploy-diff': 'bg-amber-500/10 text-amber-200 ring-amber-500/30',
  'dependency-trace': 'bg-lime-500/10 text-lime-200 ring-lime-500/30',
  'runbook-lookup': 'bg-sky-500/10 text-sky-200 ring-sky-500/30',
};

export const PHASES = ['briefing', 'investigating', 'diagnosed', 'fixing', 'testing', 'reporting'] as const;
